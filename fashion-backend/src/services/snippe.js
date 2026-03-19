const crypto = require('crypto');

const SNIPPE_API_URL = process.env.SNIPPE_API_URL || 'https://api.snippe.sh/v1';
const SNIPPE_API_KEY = process.env.SNIPPE_API_KEY;

/**
 * Initiate a payment request via Snippe.sh
 */
async function initiatePayment({ orderId, amount, phone, customerName, customerEmail, description }) {
  const idempotencyKey = `fashion-sub-${orderId}-${Date.now()}`;

  const response = await fetch(`${SNIPPE_API_URL}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SNIPPE_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      amount,
      currency: 'TZS',
      phone,
      method: 'mobile_money',
      customer: { name: customerName, email: customerEmail },
      webhook_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      metadata: { subscription_id: orderId },
      description,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Snippe API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Poll a payment by its reference ID
 */
async function getPaymentStatus(snippeReference) {
  const response = await fetch(`${SNIPPE_API_URL}/payments/${snippeReference}`, {
    headers: { Authorization: `Bearer ${SNIPPE_API_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`Snippe status check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Verify an incoming webhook signature using HMAC-SHA256
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.SNIPPE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

module.exports = { initiatePayment, getPaymentStatus, verifyWebhookSignature };
