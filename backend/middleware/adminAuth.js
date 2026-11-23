const jwt = require('jsonwebtoken');

function protect(roles) {
  return function (req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Admin login required.' });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (!roles.includes(payload.role)) return res.status(403).json({ error: 'You do not have permission to do this.' });
      req.admin = payload;
      next();
    } catch { return res.status(401).json({ error: 'Session expired. Please log in again.' }); }
  };
}

// default export = admin only (all existing routes keep working unchanged)
module.exports = protect(['admin']);
// admin or editor (writers): articles, media, tags, SEO, analytics
module.exports.staff = protect(['admin', 'editor']);
