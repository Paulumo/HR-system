const { checkPw, getDb, all, get } = require('./db');

function loginLimiter(req, res, next) {
  next();
}

function setup(app, limiter) {

  // POST /api/auth/login
  app.post('/api/auth/login', limiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const db = getDb();
    const user = await get(db, 'SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await checkPw(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user in session
    req.session.userId = user.id;

    // Sanitize response — never send password_hash
    const { password_hash, ...safe } = user;
    res.json({ user: safe });
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {});
    res.json({ ok: true });
  });

  // GET /api/auth/me — check current session
  app.get('/api/auth/me', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: req.user });
  });
}

module.exports = { setup };
