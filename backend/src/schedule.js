const { Router } = require('express');
const { getDb, all, get, run } = require('./db');
const { requireAuth } = require('./utils');

function isAM(user) {
  return user.role === 'admin' || user.role === 'manager';
}

function getScheduleRoutes() {
  const router = Router();

  // GET /api/schedule/month/:year/:month
  router.get('/schedule/month/:year/:month', requireAuth, async (req, res) => {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month) + 1; // 1-based for SQLite
    const isAdmin = isAM(req.user);

    const db = getDb();

    // Get shifts
    const shifts = await all(db, 'SELECT * FROM shifts ORDER BY id');

    // Get schedule data
    let employees;
    if (isAdmin) {
      const rows = await all(db, `SELECT id, name_zh, dept FROM users WHERE role != 'admin' ORDER BY dept, id`);
      employees = rows;
    } else {
      const rows = await all(db, `SELECT id, name_zh, dept FROM users WHERE id = ?`, [req.user.id]);
      employees = rows;
    }

    // Get schedules for all employees in this month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const schedules = await all(db,
      `SELECT employee_id, date, shift_id FROM schedules WHERE date >= ? AND date <= ? AND employee_id IN (${employees.map(() => '?').join(',')})`,
      [startDate, endDate, ...employees.map(e => e.id)]);

    // Flatten into employee -> day -> shift
    const schedData = {};
    for (const emp of employees) {
      schedData[emp.id] = {};
    }
    for (const s of schedules) {
      const day = parseInt(s.date.split('-')[2]);
      schedData[s.employee_id][day] = s.shift_id;
    }

    res.json({
      employees,
      shifts,
      schedule: schedData,
      year,
      month: parseInt(req.params.month),
      daysInMonth
    });
  });

  // PUT /api/schedule/:employeeId/:date — admin only
  router.put('/schedule/:employeeId/:date', requireAuth, async (req, res) => {
    if (!isAM(req.user)) return res.status(403).json({ error: 'Permission denied' });

    const { shift_id } = req.body;
    if (!shift_id) return res.status(400).json({ error: 'Missing shift_id' });

    const db = getDb();
    // Verify shift exists
    const shift = await get(db, 'SELECT id FROM shifts WHERE id = ?', [shift_id]);
    if (!shift) return res.status(400).json({ error: 'Invalid shift' });

    await run(db,
      `INSERT INTO schedules (employee_id, date, shift_id) VALUES (?, ?, ?)
       ON CONFLICT(employee_id, date) DO UPDATE SET shift_id = ?`,
      [req.params.employeeId, req.params.date, shift_id, shift_id]);

    res.json({ ok: true });
  });

  // GET /api/shifts — list all shifts
  router.get('/shifts', async (req, res) => {
    const db = getDb();
    const shifts = await all(db, 'SELECT * FROM shifts ORDER BY id');
    res.json({ shifts });
  });

  return router;
}

module.exports = { getScheduleRoutes };
