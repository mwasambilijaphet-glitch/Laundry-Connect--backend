const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getStatus, getQR, getActiveSessions, sendToPhone } = require('../services/whatsapp');

const router = express.Router();

// ── GET /api/whatsapp/status — Bot connection status ────
router.get('/status', authenticate, authorize('admin'), (req, res) => {
  res.json({
    success: true,
    status: getStatus(),
    qr: getQR(),
    activeSessions: getActiveSessions(),
  });
});

// ── POST /api/whatsapp/send — Send message to a phone ──
router.post('/send', authenticate, authorize('admin'), async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ success: false, message: 'Phone and message required' });
  }

  const sent = await sendToPhone(phone, message);
  res.json({ success: sent, message: sent ? 'Message sent' : 'Failed to send' });
});

module.exports = router;
