const { Router } = require('express');
const { getDb, all, get, run } = require('./db');
const { requireAuth, genId } = require('./utils');

function getAttendanceRoutes() {
  const router = Router();

  // GET /api/attendance/my — current user's attendance records
  router.get('/attendance/my', requireAuth, async (req, res) => {
    const db = getDb();
    const rows = await all(db,
      `SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 30`,
      [req.user.id]);
    res.json({ records: rows });
  });

  // GET /api/attendance/:employeeId — admin/manager view
  router.get('/attendance/:employeeId', requireAuth, async (req, res) => {
    if (req.user.role !== 'admin' && req.params.employeeId !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const db = getDb();
    const rows = await all(db,
      `SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 30`,
      [req.params.employeeId]);
    res.json({ records: rows });
  });

  // POST /api/attendance/clock-in
  router.post('/attendance/clock-in', requireAuth, async (req, res) => {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // Check if already clocked in
    const existing = await get(db, 'SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [req.user.id, today]);
    if (existing) return res.status(400).json({ error: 'Already clocked in today' });

    // Get schedule for today
    const dayOfMonth = new Date().getDate();
    const sched = await all(db, `SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?`, [req.user.id, today]);
    const shift = sched[0] || { id: 'day', hours: 8, is_work: 1 };

    if (!shift.is_work) {
      return res.status(400).json({ error: 'Day off - no punch needed' });
    }

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // Determine late or normal based on shift start time
    let status = 'normal';
    if (shift.time) {
      const [startH, startM] = shift.time.split(/[–\-]/)[0].trim().split(':').map(Number);
      const shiftStartMin = startH * 60 + startM + 5;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin > shiftStartMin) status = 'late';
    }

    const id = genId('C');
    await run(db,
      `INSERT INTO attendance (id, employee_id, date, clock_in, clock_out, overtime, status)
       VALUES (?, ?, ?, ?, NULL, 0, ?)`,
      [id, req.user.id, today, time, status]);

    res.json({ ok: true, time, status, shift });
  });

  // POST /api/attendance/clock-out
  router.post('/attendance/clock-out', requireAuth, async (req, res) => {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const record = await get(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [req.user.id, today]);
    if (!record) return res.status(400).json({ error: 'Not clocked in' });
    if (record.clock_out) return res.status(400).json({ error: 'Already clocked out' });

    // Get shift info
    const sched = await all(db, `SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?`, [req.user.id, today]);
    const shift = sched[0] || { id: 'day' };

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // Calculate overtime
    let overtime = 0;
    if (shift.time) {
      const endTimeStr = shift.time.split(/[–\-]/)[1]?.trim();
      if (endTimeStr) {
        const [endH, endM] = endTimeStr.split(':').map(Number);
        const endMin = endH * 60 + endM;
        const nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin > endMin) overtime = Math.round((nowMin - endMin) / 60 * 10) / 10;
      }
    }

    await run(db, 'UPDATE attendance SET clock_out = ?, overtime = ? WHERE id = ?', [time, overtime, record.id]);

    res.json({ ok: true, time, overtime });
  });

  // POST /api/attendance/manual — direct modify, no approval
  router.post('/attendance/manual', requireAuth, async (req, res) => {
    const { date, clock_in, clock_out } = req.body;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const db = getDb();
    
    // Get shift info to calculate overtime if needed
    const sched = await all(db, `SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?`, [req.user.id, date]);
    const shift = sched[0] || { id: 'day' };

    // Determine status (check if late if clocking in)
    let status = 'normal';
    
    // Check if record exists to keep existing data if only one side is updated
    const existing = await get(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [req.user.id, date]);
    
    const finalIn = clock_in !== undefined ? clock_in : (existing ? existing.clock_in : null);
    const finalOut = clock_out !== undefined ? clock_out : (existing ? existing.clock_out : null);

    if (finalIn && shift.time) {
      const [startH, startM] = shift.time.split(/[–\-]/)[0].trim().split(':').map(Number);
      const shiftStartMin = startH * 60 + startM + 5;
      const [inH, inM] = finalIn.split(':').map(Number);
      const inMin = inH * 60 + inM;
      if (inMin > shiftStartMin) status = 'late';
    }

    let overtime = 0;
    if (finalOut && shift.time) {
      const endTimeStr = shift.time.split(/[–\-]/)[1]?.trim();
      if (endTimeStr) {
        const [endH, endM] = endTimeStr.split(':').map(Number);
        const endMin = endH * 60 + endM;
        const [outH, outM] = finalOut.split(':').map(Number);
        const outMin = outH * 60 + outM;
        if (outMin > endMin) overtime = Math.round((outMin - endMin) / 60 * 10) / 10;
      }
    }

    if (existing) {
      await run(db, 
        `UPDATE attendance SET clock_in = ?, clock_out = ?, overtime = ?, status = ? WHERE id = ?`,
        [finalIn, finalOut, overtime, status, existing.id]);
    } else {
      const id = genId('C');
      await run(db,
        `INSERT INTO attendance (id, employee_id, date, clock_in, clock_out, overtime, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.id, date, finalIn, finalOut, overtime, status]);
    }

    res.json({ ok: true });
  });

  // GET /api/attendance/all — admin/manager: all employees' recent attendance
  router.get('/attendance/all', requireAuth, async (req, res) => {
    if (req.user.role === 'employee') return res.status(403).json({ error: 'Permission denied' });
    const db = getDb();
    const rows = await all(db,
      `SELECT a.*, u.name_zh, u.dept FROM attendance a JOIN users u ON a.employee_id = u.id
       ORDER BY a.date DESC LIMIT 100`);
    res.json({ records: rows });
  });

  return router;
}

module.exports = { getAttendanceRoutes };
