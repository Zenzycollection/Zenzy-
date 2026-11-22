const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!process.env.ADMIN_EMAIL || !(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD) || !process.env.JWT_SECRET) return res.status(503).json({ error: 'Admin credentials are not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD and JWT_SECRET.' });
  const emailOk = email === process.env.ADMIN_EMAIL.toLowerCase();
  const passOk = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!emailOk || !passOk) return res.status(401).json({ error: 'Incorrect email or password.' });
  const token = jwt.sign({ role: 'admin', email }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, expiresIn: '8h', user: { email, role: 'admin' } });
});
module.exports = router;
