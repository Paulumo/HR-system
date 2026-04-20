const express = require('express');
const session = require('express-session');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { initDb } = require('./db');
const { setup: setupAuth } = require('./auth');
const { getAttendanceRoutes: attRoutes } = require('./attendance');
const { getLeaveRoutes: leaveRoutes } = require('./leaves');
const { getSupplementRoutes: suppRoutes } = require('./supplements');
const { getOTRoutes: otRoutes } = require('./overtime');
const { getCompRoutes: compRoutes } = require('./comp');
const { getScheduleRoutes: schedRoutes } = require('./schedule');
const { getAdminRoutes: adminRoutes } = require('./admin');

const app = express();
const PORT = process.env.PORT || 4443;

// Core middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

async function start() {
  await initDb();
  console.log('Database initialized');

  // Session (cookie-based, httpOnly)
  app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-before-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    }
  }));

  // Auth middleware (adds req.user to all routes after)
  app.use(async (req, _res, next) => {
    const userId = req.session?.userId;
    if (userId) {
      const { getDb, all } = require('./db');
      const db = getDb();
      try {
        const rows = await all(db, 'SELECT id, username, role, name_zh, dept FROM users WHERE id = ?', [userId]);
        req.user = rows[0] || null;
      } catch {
        req.user = null;
      }
    }
    next();
  });

  // Rate limit on login
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again later.' }
  });

  // Setup auth routes
  setupAuth(app, loginLimiter);

  // Setup business routes
  app.use('/api', attRoutes());
  app.use('/api', leaveRoutes());
  app.use('/api', suppRoutes());
  app.use('/api', otRoutes());
  app.use('/api', compRoutes());
  app.use('/api', schedRoutes());
  app.use('/api/admin', adminRoutes());

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.listen(PORT, () => {
    console.log(`HR System API running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
