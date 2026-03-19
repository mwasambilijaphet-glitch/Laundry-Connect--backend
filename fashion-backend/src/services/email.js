const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendOTP(email, fullName, otp) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #0a0a0a; margin: 0; padding: 40px 20px; }
    .container { max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #222; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #c9a96e 0%, #e8c98a 50%, #c9a96e 100%); padding: 40px 32px; text-align: center; }
    .logo { font-size: 28px; font-weight: 800; color: #000; letter-spacing: -0.5px; }
    .tagline { font-size: 13px; color: #333; margin-top: 4px; }
    .body { padding: 40px 32px; }
    .greeting { font-size: 18px; color: #fff; font-weight: 600; margin-bottom: 12px; }
    .text { font-size: 14px; color: #aaa; line-height: 1.6; margin-bottom: 32px; }
    .otp-box { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px; }
    .otp-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; }
    .otp-code { font-size: 48px; font-weight: 800; letter-spacing: 12px; color: #c9a96e; font-family: 'Courier New', monospace; }
    .expires { font-size: 12px; color: #555; margin-top: 12px; }
    .footer { padding: 24px 32px; border-top: 1px solid #1a1a1a; text-align: center; }
    .footer-text { font-size: 12px; color: #444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Fashion.co.tz</div>
      <div class="tagline">Your AI-Powered Fashion Platform</div>
    </div>
    <div class="body">
      <div class="greeting">Hello, ${fullName} 👋</div>
      <div class="text">
        Welcome to Fashion.co.tz! Use the code below to verify your email address and unlock your account.
      </div>
      <div class="otp-box">
        <div class="otp-label">Verification Code</div>
        <div class="otp-code">${otp}</div>
        <div class="expires">Expires in 10 minutes</div>
      </div>
      <div class="text">
        If you did not create an account with Fashion.co.tz, please ignore this email.
      </div>
    </div>
    <div class="footer">
      <div class="footer-text">© ${new Date().getFullYear()} Fashion.co.tz · All rights reserved</div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Fashion.co.tz <noreply@fashion.co.tz>',
    to: email,
    subject: `${otp} — Your Fashion.co.tz verification code`,
    html,
  });
}

async function sendSubscriptionConfirmation(email, fullName, expiryDate) {
  const expiry = new Date(expiryDate).toLocaleDateString('en-TZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #0a0a0a; margin: 0; padding: 40px 20px; }
    .container { max-width: 520px; margin: 0 auto; background: #111; border: 1px solid #222; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #c9a96e 0%, #e8c98a 50%, #c9a96e 100%); padding: 40px 32px; text-align: center; }
    .logo { font-size: 28px; font-weight: 800; color: #000; }
    .body { padding: 40px 32px; }
    .greeting { font-size: 18px; color: #fff; font-weight: 600; margin-bottom: 12px; }
    .text { font-size: 14px; color: #aaa; line-height: 1.6; margin-bottom: 24px; }
    .badge { background: linear-gradient(135deg, #c9a96e, #e8c98a); border-radius: 8px; padding: 20px 24px; margin-bottom: 24px; text-align: center; }
    .badge-title { font-size: 12px; color: #333; text-transform: uppercase; letter-spacing: 1px; }
    .badge-value { font-size: 22px; font-weight: 800; color: #000; margin-top: 6px; }
    .footer { padding: 24px 32px; border-top: 1px solid #1a1a1a; text-align: center; }
    .footer-text { font-size: 12px; color: #444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Fashion.co.tz</div>
    </div>
    <div class="body">
      <div class="greeting">Subscription Activated! 🎉</div>
      <div class="text">
        Congratulations ${fullName}! Your weekly subscription to Fashion.co.tz is now active.
        Enjoy unlimited access to AI Fashion Design, Smart Outfit Recommendations, and your personal AI Fashion Assistant.
      </div>
      <div class="badge">
        <div class="badge-title">Active Until</div>
        <div class="badge-value">${expiry}</div>
      </div>
      <div class="text">
        Amount charged: <strong>5,000 TZS</strong>
      </div>
    </div>
    <div class="footer">
      <div class="footer-text">© ${new Date().getFullYear()} Fashion.co.tz · All rights reserved</div>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'Fashion.co.tz <noreply@fashion.co.tz>',
    to: email,
    subject: 'Your Fashion.co.tz subscription is active!',
    html,
  });
}

module.exports = { sendOTP, sendSubscriptionConfirmation };
