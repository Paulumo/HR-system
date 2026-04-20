const { Router } = require('express');
const { getDb, all, get, run, hashPw } = require('./db');
const { requireAuth } = require('./utils');

function getAdminRoutes() {
  const router = Router();

  // Only admin role
  function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  }

  // GET /api/admin/users — list all users (admin only)
  router.get('/users', requireAdmin, async (req, res) => {
    const db = getDb();
    const users = await all(db, 'SELECT id, username, role, name_zh, name_en, dept, dept_en, title, title_en, hire_date, birthday, phone, emerg_name, emerg_phone, proxy_id, manager_id FROM users ORDER BY dept, id');
    res.json({ users });
  });

  // GET /api/admin/users/:id — single user
  router.get('/users/:id', requireAdmin, async (req, res) => {
    const db = getDb();
    const user = await get(db, 'SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const { password_hash, ...safe } = user;
    res.json({ user: safe });
  });

  // PUT /api/admin/users/:id
  router.put('/users/:id', requireAdmin, async (req, res) => {
    const db = getDb();
    const existing = await get(db, 'SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { password, name_zh, name_en, dept, dept_en, title, title_en, hire_date, birthday, phone, emerg_name, emerg_phone, proxy_id, manager_id, role } = req.body;

    let pwUpdate = {};
    if (password) {
      pwUpdate.password_hash = await hashPw(password);
    }

    const autoProxy = role === 'manager' ? 'H033' : null;

    await run(db,
      `UPDATE users SET name_zh = ?, name_en = ?, dept = ?, dept_en = ?, title = ?, title_en = ?,
       hire_date = ?, birthday = ?, phone = ?, emerg_name = ?, emerg_phone = ?,
       proxy_id = ?, manager_id = ?, role = ? ${password ? ', password_hash = ?' : ''} WHERE id = ?`,
      [name_zh, name_en, dept, dept_en, title, title_en, hire_date, birthday, phone, emerg_name, emerg_phone,
       autoProxy || proxy_id, manager_id, role, ...(password ? [pwUpdate.password_hash] : []), req.params.id]);

    res.json({ ok: true });
  });

  // POST /api/admin/users — create new user
  router.post('/users', requireAdmin, async (req, res) => {
    const { id, username, password, name_zh, name_en, dept, dept_en, title, title_en, hire_date, birthday, phone, emerg_name, emerg_phone, role } = req.body;
    if (!id || !username || !name_zh || !dept) {
      return res.status(400).json({ error: 'Missing required fields: id, username, name_zh, dept' });
    }

    const db = getDb();
    const exists = await get(db, 'SELECT id FROM users WHERE id = ?', [id]);
    if (exists) return res.status(409).json({ error: 'User already exists' });

    const pw = await hashPw(password || '1234');
    const proxy = role === 'manager' ? 'H033' : null;

    await run(db,
      `INSERT INTO users (id, username, password_hash, role, name_zh, name_en, dept, dept_en, title, title_en, hire_date, birthday, phone, emerg_name, emerg_phone, proxy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, username, pw, role, name_zh, name_en, dept, dept_en, title, title_en, hire_date, birthday, phone, emerg_name, emerg_phone, proxy]);

    res.json({ ok: true });
  });

  // DELETE /api/admin/users/:id
  router.delete('/users/:id', requireAdmin, async (req, res) => {
    const db = getDb();
    const user = await get(db, 'SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });

    await run(db, 'DELETE FROM users WHERE id = ?', [req.params.id]);
    await run(db, 'DELETE FROM schedules WHERE employee_id = ?', [req.params.id]);

    // Also delete their attendance/requests
    await run(db, 'DELETE FROM attendance WHERE employee_id = ?', [req.params.id]);
    await run(db, 'DELETE FROM leave_requests WHERE applicant_id = ?', [req.params.id]);
    await run(db, 'DELETE FROM supplement_requests WHERE applicant_id = ?', [req.params.id]);
    await run(db, 'DELETE FROM ot_requests WHERE applicant_id = ?', [req.params.id]);
    await run(db, 'DELETE FROM comp_time WHERE employee_id = ?', [req.params.id]);

    res.json({ ok: true });
  });

  // POST /api/admin/shifts — create shift
  router.post('/shifts', requireAdmin, async (req, res) => {
    const { id, label, time, short, color, hours } = req.body;
    if (!id || !short) return res.status(400).json({ error: 'Missing id or short' });

    const db = getDb();
    const exists = await get(db, 'SELECT id FROM shifts WHERE id = ?', [id]);
    if (exists) return res.status(409).json({ error: 'Shift already exists' });

    const isWork = !!time ? 1 : 0;
    await run(db,
      `INSERT INTO shifts (id, label, time, short, color, hours, is_work) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, label || '', time || '', short, color || '#9CA3AF', hours || 0, isWork]);

    res.json({ ok: true });
  });

  // PUT /api/admin/shifts/:id
  router.put('/shifts/:id', requireAdmin, async (req, res) => {
    const { label, time, short, color, hours } = req.body;
    const db = getDb();
    const exists = await get(db, 'SELECT id FROM shifts WHERE id = ?', [req.params.id]);
    if (!exists) return res.status(404).json({ error: 'Not found' });

    const isWork = !!time ? 1 : 0;
    await run(db,
      `UPDATE shifts SET label = ?, time = ?, short = ?, color = ?, hours = ?, is_work = ? WHERE id = ?`,
      [label, time, short, color, hours || 0, isWork, req.params.id]);

    res.json({ ok: true });
  });

  // DELETE /api/admin/shifts/:id
  router.delete('/shifts/:id', requireAdmin, async (req, res) => {
    const db = getDb();
    const exists = await get(db, 'SELECT id FROM shifts WHERE id = ?', [req.params.id]);
    if (!exists) return res.status(404).json({ error: 'Not found' });

    await run(db, 'DELETE FROM shifts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { getAdminRoutes };
