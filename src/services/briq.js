/**
 * Briq.tz Integration Service
 *
 * Sends SMS and WhatsApp OTP messages via briq.tz API.
 * briq.tz is a Tanzanian communication platform providing:
 * - Bulk SMS
 * - WhatsApp messaging (no Twilio/Meta needed)
 * - Voice & OTP
 *
 * Docs: https://briq.tz
 * API: https://api.briq.tz
 */

// Read env at runtime (not module load) so .env changes are picked up
function getConfig() {
  return {
    apiBase: process.env.BRIQ_API_URL || 'https://api.briq.tz/v1',
    apiKey: process.env.BRIQ_API_KEY,
    senderId: process.env.BRIQ_SENDER_ID || 'LaundryConnect',
  };
}

/**
 * Send SMS OTP via briq.tz
 */
async function sendSMSOTP(phone, otp) {
  const { apiBase, apiKey, senderId } = getConfig();

  if (!apiKey) {
    console.warn('BRIQ_API_KEY not set — SMS OTP will not be sent');
    return { success: false, reason: 'api_key_missing' };
  }

 try {
  const response = await fetch(`${apiBase}/message/send-instant`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey, // ✅ correct header
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_id: senderId,
      recipients: formatPhone(phone),
      content: `Your Laundry Connect verification code is: ${otp}. This code expires in 10 minutes. Do not share it with anyone.`,
      campaign_id: "otp_campaign",
      groups: []
    }),
  });

  // 🔍 Handle non-JSON responses safely
  const text = await response.text();

  try {
    const data = JSON.parse(text);
    console.log("✅ Success:", data);
  } catch (err) {
    console.error("❌ Not JSON response:", text);
  }

} catch (error) {
  console.error("🔥 Fetch error:", error);
}
}

/**
 * Send WhatsApp OTP via briq.tz
 * No Twilio or Meta Business API needed — briq.tz handles the WhatsApp channel directly.
 */
async function sendWhatsAppOTP(phone, otp) {
  const { apiBase, apiKey } = getConfig();

  if (!apiKey) {
    console.warn('BRIQ_API_KEY not set — WhatsApp OTP will not be sent');
    return { success: false, reason: 'api_key_missing' };
  }

  try {
    const response = await fetch(`${apiBase}/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: formatPhone(phone),
        type: 'template',
        template: {
          name: 'otp_verification',
          language: 'en',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: otp },
                { type: 'text', text: '10' },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                { type: 'text', text: otp },
              ],
            },
          ],
        },
        fallback_message: `*Laundry Connect*\n\nYour verification code is:\n\n*${otp}*\n\nThis code expires in 10 minutes.\nDo not share it with anyone.`,
      }),
    });

    const data = await response.json();
    console.log('Briq WhatsApp sent to:', formatPhone(phone), '| Status:', response.status, '| Response:', data.status || data.message);
    return { success: response.ok, data };
  } catch (err) {
    console.error('Briq WhatsApp error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Send password reset OTP via SMS
 */
async function sendPasswordResetSMS(phone, otp) {
  const { apiBase, apiKey, senderId } = getConfig();

  if (!apiKey) {
    return { success: false, reason: 'api_key_missing' };
  }

  try {
    const response = await fetch(`${apiBase}/sms/send`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey, // ✅ correct header
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_id: senderId,
        recipients: formatPhone(phone),
        content: `Your Laundry Connect password reset code is: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore.`,
        campaign_id: "password_reset",
        groups: []
      }),
    });

    const data = await response.json();
    return { success: response.ok, data };
  } catch (err) {
    console.error('Briq reset SMS error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Format Tanzanian phone number to international format
 * e.g., "0754123456" -> "+255754123456"
 */
function formatPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+255' + cleaned.substring(1);
  } else if (cleaned.startsWith('255') && !cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

module.exports = {
  sendSMSOTP,
  sendWhatsAppOTP,
  sendPasswordResetSMS,
  formatPhone,
};
