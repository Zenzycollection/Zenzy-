const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

async function passwordMatches(password, hash, plain) {
  if (hash) return bcrypt.compare(password, hash);
  if (!plain) return false;
  const a = Buffer.from(password), b = Buffer.from(plain);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!process.env.JWT_SECRET) return res.status(503).json({ error: 'Admin credentials are not configured. Set JWT_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD_HASH.' });
  const accounts = [
    { role: 'admin', email: process.env.ADMIN_EMAIL, hash: process.env.ADMIN_PASSWORD_HASH, plain: process.env.ADMIN_PASSWORD },
    { role: 'editor', email: process.env.EDITOR_EMAIL, hash: process.env.EDITOR_PASSWORD_HASH, plain: process.env.EDITOR_PASSWORD }
  ].filter(a => a.email && (a.hash || a.plain));
  if (!accounts.length) return res.status(503).json({ error: 'Admin credentials are not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD_HASH and JWT_SECRET.' });
  const account = accounts.find(a => a.email.toLowerCase() === email);
  const ok = account ? await passwordMatches(password, account.hash, account.plain) : false;
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  const token = jwt.sign({ role: account.role, email }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, expiresIn: '8h', user: { email, role: account.role } });
});

module.exports = router;
