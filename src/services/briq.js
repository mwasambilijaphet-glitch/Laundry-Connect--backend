/**
 * Briq.tz Integration Service
 *
 * Sends SMS and WhatsApp OTP messages via briq.tz (Karibu) API.
 * Docs: https://docs.briq.tz
 * API Base: https://karibu.briq.tz/v1
 */

// Read env at runtime (not module load) so .env changes are picked up
function getConfig() {
  return {
    apiBase: process.env.BRIQ_API_URL || 'https://karibu.briq.tz/v1',
    apiKey: process.env.BRIQ_API_KEY,
    senderId: process.env.BRIQ_SENDER_ID || 'LaundryConnect',
  };
}

/**
 * Format Tanzanian phone number for Briq API
 * Briq expects: "255754123456" (no + prefix, array of strings)
 * e.g., "0754123456" -> "255754123456"
 */
function formatPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.replace(/[\s\-()+']+/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '255' + cleaned.substring(1);
  } else if (!cleaned.startsWith('255')) {
    cleaned = '255' + cleaned;
  }
  return cleaned;
}

/**
 * Send SMS OTP via briq.tz (Karibu)
 * Endpoint: POST /v1/message/send-instant
 * Docs: https://docs.briq.tz/api-reference/karibu-messages/send-instant-message
 */
async function sendSMSOTP(phone, otp) {
  const { apiBase, apiKey, senderId } = getConfig();

  if (!apiKey) {
    console.warn('BRIQ_API_KEY not set — SMS OTP will not be sent');
    return { success: false, reason: 'api_key_missing' };
  }

  const recipient = formatPhone(phone);
  console.log('Briq SMS sending to:', recipient);

  try {
    const response = await fetch(`${apiBase}/message/send-instant`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `Your Laundry Connect verification code is: ${otp}. This code expires in 10 minutes. Do not share it with anyone.`,
        recipients: [recipient],
        sender_id: senderId,
      }),
    });

    const text = await response.text();
    console.log('Briq SMS response:', response.status, text);

    try {
      const data = JSON.parse(text);
      return { success: response.ok, data };
    } catch (err) {
      return { success: response.ok, data: text };
    }
  } catch (error) {
    console.error('Briq SMS fetch error:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Send WhatsApp OTP via briq.tz
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

    const text = await response.text();
    console.log('Briq WhatsApp response:', response.status, text);
    try {
      const data = JSON.parse(text);
      return { success: response.ok, data };
    } catch (err) {
      return { success: response.ok, data: text };
    }
  } catch (err) {
    console.error('Briq WhatsApp error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Send password reset OTP via SMS
 * Uses the same send-instant endpoint as regular OTP
 */
async function sendPasswordResetSMS(phone, otp) {
  const { apiBase, apiKey, senderId } = getConfig();

  if (!apiKey) {
    return { success: false, reason: 'api_key_missing' };
  }

  const recipient = formatPhone(phone);

  try {
    const response = await fetch(`${apiBase}/message/send-instant`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `Your Laundry Connect password reset code is: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore.`,
        recipients: [recipient],
        sender_id: senderId,
      }),
    });

    const text = await response.text();
    console.log('Briq reset SMS response:', response.status, text);
    try {
      const data = JSON.parse(text);
      return { success: response.ok, data };
    } catch (err) {
      return { success: response.ok, data: text };
    }
  } catch (err) {
    console.error('Briq reset SMS error:', err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = {
  sendSMSOTP,
  sendWhatsAppOTP,
  sendPasswordResetSMS,
  formatPhone,
};
