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

const BRIQ_API_BASE = process.env.BRIQ_API_URL || 'https://api.briq.tz/v1';
const BRIQ_API_KEY = process.env.BRIQ_API_KEY;
const BRIQ_SENDER_ID = process.env.BRIQ_SENDER_ID || 'LaundryConnect';

/**
 * Send SMS OTP via briq.tz
 */
async function sendSMSOTP(phone, otp) {
  if (!BRIQ_API_KEY) {
    console.warn('BRIQ_API_KEY not set — SMS OTP will not be sent');
    return { success: false, reason: 'api_key_missing' };
  }

  try {
    const response = await fetch(`${BRIQ_API_BASE}/sms/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_id: BRIQ_SENDER_ID,
        to: formatPhone(phone),
        message: `Your Laundry Connect verification code is: ${otp}. This code expires in 10 minutes. Do not share it with anyone.`,
      }),
    });

    const data = await response.json();
    console.log('Briq SMS sent to:', phone, '| Response:', data.status || data.message);
    return { success: response.ok, data };
  } catch (err) {
    console.error('Briq SMS error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Send WhatsApp OTP via briq.tz
 * No Twilio or Meta Business API needed — briq.tz handles the WhatsApp channel directly.
 */
async function sendWhatsAppOTP(phone, otp) {
  if (!BRIQ_API_KEY) {
    console.warn('BRIQ_API_KEY not set — WhatsApp OTP will not be sent');
    return { success: false, reason: 'api_key_missing' };
  }

  try {
    const response = await fetch(`${BRIQ_API_BASE}/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIQ_API_KEY}`,
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
                { type: 'text', text: '10' }, // expiry in minutes
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
        // Fallback for when template is not available
        fallback_message: `*Laundry Connect* 🧺\n\nYour verification code is:\n\n*${otp}*\n\nThis code expires in 10 minutes.\nDo not share it with anyone.`,
      }),
    });

    const data = await response.json();
    console.log('Briq WhatsApp sent to:', phone, '| Response:', data.status || data.message);
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
  if (!BRIQ_API_KEY) {
    return { success: false, reason: 'api_key_missing' };
  }

  try {
    const response = await fetch(`${BRIQ_API_BASE}/sms/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_id: BRIQ_SENDER_ID,
        to: formatPhone(phone),
        message: `Your Laundry Connect password reset code is: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore.`,
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
 * e.g., "0754123456" → "+255754123456"
 */
function formatPhone(phone) {
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
