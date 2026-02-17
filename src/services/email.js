import crypto from 'crypto';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function sendEmail({ to, subject, text, html }) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const passRaw = process.env.SMTP_PASS;
  const pass = passRaw ? String(passRaw).replace(/\s+/g, '') : passRaw;
  const from = process.env.SMTP_FROM || user;

  if (!host || !port || !user || !pass || !from) {
    const missing = {
      SMTP_HOST: !host,
      SMTP_PORT: !port,
      SMTP_USER: !user,
      SMTP_PASS: !pass,
      SMTP_FROM: !from
    };
    console.warn('[email] SMTP not configured; skipping send', {
      to,
      subject,
      missing
    });
    return { sent: false, reason: 'smtp_not_configured', missing };
  }

  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch (e) {
    console.warn('[email] nodemailer not installed; skipping send', { to, subject });
    return { sent: false, reason: 'nodemailer_missing' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass }
  });

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    return { sent: true };
  } catch (e) {
    return {
      sent: false,
      reason: 'smtp_send_failed',
      error: e?.message || String(e)
    };
  }
}

export function generateNumericOtp(digits = 6) {
  const max = 10 ** digits;
  const num = crypto.randomInt(0, max);
  return String(num).padStart(digits, '0');
}

export function hashOtp(otp, salt) {
  return crypto.pbkdf2Sync(String(otp), String(salt), 100000, 64, 'sha512').toString('hex');
}
