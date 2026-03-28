/**
 * NextSMS Integration Service
 *
 * Sends SMS via NextSMS (nextsms.co.tz) — Tanzania's SMS gateway.
 * Customer Number: 208961
 *
 * Docs: https://nextsms.io/api/developer-guide.html
 * API: https://api.nextsms.co/api
 */

function getConfig() {
  return {
    apiBase: process.env.NEXTSMS_API_URL || 'https://api.nextsms.co/api',
    username: process.env.NEXTSMS_USERNAME,
    password: process.env.NEXTSMS_PASSWORD,
    senderId: process.env.NEXTSMS_SENDER_ID || 'NEXTSMS',
  };
}

/**
 * Build Basic Auth header for NextSMS
 */
function getAuthHeader() {
  const { username, password } = getConfig();
  if (!username || !password) return null;
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Send SMS OTP via NextSMS
 */
async function sendSMSOTP(phone, otp) {
  const { apiBase, senderId } = getConfig();
  const auth = getAuthHeader();

  if (!auth) {
    console.warn('NEXTSMS_USERNAME/PASSWORD not set — SMS OTP will not be sent');
    return { success: false, reason: 'credentials_missing' };
  }

  try {
    const to = formatPhone(phone);
    const response = await fetch(`${apiBase}/sms/v1/text/single`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        from: senderId,
        to,
        text: `Your Laundry Connect verification code is: ${otp}. This code expires in 10 minutes. Do not share it with anyone.`,
      }),
    });

    const data = await response.json().catch(() => ({}));
    console.log('NextSMS sent to:', to, '| Status:', response.status, '| Response:', JSON.stringify(data));
    return { success: response.ok, data };
  } catch (err) {
    console.error('NextSMS error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Send WhatsApp OTP — falls back to SMS since NextSMS doesn't support WhatsApp
 */
async function sendWhatsAppOTP(phone, otp) {
  console.log('WhatsApp not supported by NextSMS, falling back to SMS');
  return sendSMSOTP(phone, otp);
}

/**
 * Send password reset OTP via SMS
 */
async function sendPasswordResetSMS(phone, otp) {
  const { apiBase, senderId } = getConfig();
  const auth = getAuthHeader();

  if (!auth) {
    return { success: false, reason: 'credentials_missing' };
  }

  try {
    const to = formatPhone(phone);
    const response = await fetch(`${apiBase}/sms/v1/text/single`, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        from: senderId,
        to,
        text: `Your Laundry Connect password reset code is: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore.`,
      }),
    });

    const data = await response.json().catch(() => ({}));
    console.log('NextSMS reset SMS sent to:', to, '| Status:', response.status);
    return { success: response.ok, data };
  } catch (err) {
    console.error('NextSMS reset SMS error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Format Tanzanian phone number to international format
 * e.g., "0754123456" -> "255754123456"
 * NextSMS expects format without + prefix
 */
function formatPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '255' + cleaned.substring(1);
  }
  if (!cleaned.startsWith('255')) {
    cleaned = '255' + cleaned;
  }
  return cleaned;
}

module.exports = {
  sendSMSOTP,
  sendWhatsAppOTP,
  sendPasswordResetSMS,
  formatPhone,
};
