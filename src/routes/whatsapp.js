const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { getStatus, getQR, getActiveSessions, sendToPhone } = require('../services/whatsapp');

const router = express.Router();

// ── GET /api/whatsapp/status — Bot connection status ────
router.get('/status', authenticate, authorize('admin'), (req, res) => {
  const qr = getQR();
  res.json({
    success: true,
    status: getStatus(),
    qr: qr || null,
    activeSessions: getActiveSessions(),
    hint: qr
      ? 'Scan the QR code at /api/whatsapp/qr-page to connect WhatsApp'
      : getStatus() === 'connected'
        ? 'WhatsApp bot is connected and running'
        : 'Waiting for WhatsApp bot to generate QR code...',
  });
});

// ── GET /api/whatsapp/qr-page — Scannable QR code page (admin only) ──
router.get('/qr-page', authenticate, authorize('admin'), (req, res) => {
  const qr = getQR();
  const status = getStatus();

  if (status === 'connected') {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1 style="color:green">✅ WhatsApp Connected!</h1>
        <p>The bot is running and receiving messages.</p>
        <p>Active sessions: ${getActiveSessions()}</p>
      </body></html>
    `);
  }

  if (!qr) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1>⏳ Waiting for QR Code...</h1>
        <p>The WhatsApp bot is starting up. Refresh in a few seconds.</p>
        <script>setTimeout(() => location.reload(), 5000)</script>
      </body></html>
    `);
  }

  // Generate QR code as SVG using a simple inline approach
  res.send(`
    <html>
    <head>
      <title>Laundry Connect — WhatsApp QR</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
    </head>
    <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc">
      <h1 style="color:#15803d">🧺 Laundry Connect — WhatsApp Bot</h1>
      <p style="color:#64748b;margin-bottom:24px">Scan this QR code with WhatsApp to connect the bot</p>
      <div style="display:inline-block;background:white;padding:24px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.1)">
        <canvas id="qr"></canvas>
      </div>
      <p style="color:#94a3b8;margin-top:16px;font-size:14px">QR code refreshes automatically</p>
      <script>
        QRCode.toCanvas(document.getElementById('qr'), ${JSON.stringify(qr)}, { width: 300, margin: 2 }, function(err) {
          if (err) document.getElementById('qr').outerHTML = '<p style="color:red">Failed to render QR</p>';
        });
        setTimeout(() => location.reload(), 30000);
      </script>
    </body>
    </html>
  `);
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
