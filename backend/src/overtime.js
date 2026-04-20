const { Router } = require('express');
const { getDb, all, get, run } = require('./db');
const { requireAuth, genId } = require('./utils');

const HOURLY_BASE = 183;

function calcOTPay(hours, isRest, isHol) {
  if (isHol) return Math.round(hours * HOURLY_BASE * 2);
  if (isRest) {
    return Math.round(
      Math.min(hours, 2) * HOURLY_BASE * 4 / 3 +
      Math.min(Math.max(hours - 2, 0), 6) * HOURLY_BASE * 5 / 3 +
      Math.max(hours - 8, 0) * HOURLY_BASE * 8 / 3
    );
  }
  return Math.round(
    Math.min(hours, 2) * HOURLY_BASE * 4 / 3 +
    Math.max(hours - 2, 0) * HOURLY_BASE * 5 / 3
  );
}

function getApprovalChain(applicantId, users) {
  const applicant = users.find(u => u.id === applicantId);
  if (!applicant) return [];
  if (applicant.role === 'manager') {
    if (applicant.id === 'H001') return ['H033'];
    return ['H001', 'H033'];
  }
  const mgr = applicant.manager_id;
  if (!mgr) return ['H033', 'H001'];
  const chain = [mgr];
  if (mgr !== 'H033') chain.push('H033');
  if (mgr !== 'H001' && 'H033' !== 'H001') chain.push('H001');
  return chain;
}

function canApprove(request, currentUser, users) {
  if (request.status !== 'pending') return false;
  const chain = getApprovalChain(request.applicant_id, users);
  const step = (request._approvals_count || 0);
  if (step >= chain.length) return false;
  return currentUser.id === chain[step] || currentUser.role === 'admin';
}

function getOTRoutes() {
  const router = Router();

  // GET /api/overtime/my
  router.get('/overtime/my', requireAuth, async (req, res) => {
    const db = getDb();
    const records = await all(db,
      `SELECT * FROM ot_requests WHERE applicant_id = ? ORDER BY created_at DESC`,
      [req.user.id]);
    res.json({ records });
  });

  // GET /api/overtime/preview/:date — calculate max OT for a date
  router.get('/overtime/preview/:date', requireAuth, async (req, res) => {
    const db = getDb();
    const attendance = await get(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [req.user.id, req.params.date]);
    if (!attendance || !attendance.clock_out) {
      return res.json({ ok: false, error: 'No clock-out record' });
    }

    const day = new Date(req.params.date).getDate();
    const sched = await all(db, `SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?`, [req.user.id, req.params.date]);
    const shift = sched[0] || { id: 'day', hours: 8, is_work: 1 };

    if (!shift.time) {
      return res.json({ ok: false, error: 'No shift time defined' });
    }

    const endTimeStr = shift.time.split(/[–\-]/)[1]?.trim();
    const [endH, endM] = endTimeStr.split(':').map(Number);
    const endMin = endH * 60 + endM;

    const [coH, coM] = attendance.clock_out.split(':').map(Number);
    const coMin = coH * 60 + coM;

    let otM = coMin > endMin ? coMin - endMin : 0;
    if (otM <= 0) return res.json({ ok: false, error: 'No overtime on this date' });

    const maxH = Math.round(otM / 60 * 10) / 10;
    const isRest = !!shift.is_rest;
    const isHol = !!shift.is_regular_off || !!shift.is_national;
    const estPay = calcOTPay(maxH, isRest, isHol);

    res.json({ ok: true, maxH, shift, estPay });
  });

  // POST /api/overtime — submit OT request
  router.post('/overtime', requireAuth, async (req, res) => {
    const { date, hours, comp_type, reason } = req.body;
    if (!date || !hours || !comp_type || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (hours <= 0) return res.status(400).json({ error: 'Invalid hours' });

    // Validate against actual OT
    const db = getDb();
    const attendance = await get(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [req.user.id, date]);
    if (!attendance || !attendance.clock_out) {
      return res.status(400).json({ error: 'No clock-out record for this date' });
    }

    const sched = await all(db, `SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?`, [req.user.id, date]);
    const shift = sched[0] || { id: 'day', hours: 8, is_work: 1 };
    if (shift.time) {
      const endTimeStr = shift.time.split(/[–\-]/)[1]?.trim();
      if (endTimeStr) {
        const [endH, endM] = endTimeStr.split(':').map(Number);
        const endMin = endH * 60 + endM;
        const [coH, coM] = attendance.clock_out.split(':').map(Number);
        const coMin = coH * 60 + coM;
        const actualOT = coMin > endMin ? Math.round((coMin - endMin) / 60 * 10) / 10 : 0;
        if (hours > actualOT) {
          return res.status(400).json({ error: `Requested hours (${hours}) exceeds actual overtime (${actualOT})` });
        }
      }
    }

    const isRest = !!shift.is_rest;
    const isHol = !!shift.is_regular_off || !!shift.is_national;
    const payAmt = comp_type === 'pay' ? calcOTPay(hours, isRest, isHol) : 0;

    const id = genId('OT');
    await run(db,
      `INSERT INTO ot_requests (id, applicant_id, date, hours, comp_type, pay_amt, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, date, hours, comp_type, payAmt, reason]);

    res.json({ ok: true, id });
  });

  // GET /api/overtime/pending
  router.get('/overtime/pending', requireAuth, async (req, res) => {
    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const records = await all(db,
      `SELECT o.*, u.name_zh, u.dept FROM ot_requests o JOIN users u ON o.applicant_id = u.id
       WHERE o.status = 'pending' ORDER BY o.created_at ASC`);

    const myTurn = records.filter(r => canApprove(r, req.user, users));
    const mine = records.filter(r => r.applicant_id === req.user.id);

    const history = await all(db,
      `SELECT o.*, u.name_zh FROM ot_requests o JOIN users u ON o.applicant_id = u.id
       WHERE o.status != 'pending' ORDER BY o.created_at DESC LIMIT 50`);

    res.json({ myTurn, myPending: mine, history });
  });

  // POST /api/overtime/:id/approve
  router.post('/overtime/:id/approve', requireAuth, async (req, res) => {
    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const request = await get(db, 'SELECT * FROM ot_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Not found' });

    if (!canApprove(request, req.user, users)) {
      return res.status(403).json({ error: 'Not your turn to approve' });
    }

    await run(db,
      `INSERT OR IGNORE INTO approvals (request_id, request_type, approver_id) VALUES (?, ?, ?)`,
      [req.params.id, 'ot', req.user.id]);

    const approvals = await all(db, 'SELECT COUNT(*) as cnt FROM approvals WHERE request_id = ? AND request_type = ?', [req.params.id, 'ot']);
    const chain = getApprovalChain(request.applicant_id, users);

    if (approvals[0].cnt >= chain.length) {
      await run(db, 'UPDATE ot_requests SET status = ? WHERE id = ?', ['approved', req.params.id]);

      // If comp time, create comp_time record
      if (request.comp_type === 'comp') {
        const ctId = genId('CT');
        const expiry = new Date(new Date(request.date).setMonth(new Date(request.date).getMonth() + 6)).toISOString().split('T')[0];
        await run(db,
          `INSERT INTO comp_time (id, employee_id, earned_date, hours, source, used, expiry)
           VALUES (?, ?, ?, ?, ?, 0, ?)`,
          [ctId, request.applicant_id, request.date, request.hours, 'Overtime Comp', expiry]);
      }
    }

    res.json({ ok: true });
  });

  // POST /api/overtime/:id/reject
  router.post('/overtime/:id/reject', requireAuth, async (req, res) => {
    const { reject_reason } = req.body;
    if (!reject_reason) return res.status(400).json({ error: 'Reject reason required' });

    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const request = await get(db, 'SELECT * FROM ot_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Not found' });

    if (!canApprove(request, req.user, users)) {
      return res.status(403).json({ error: 'Not your turn to reject' });
    }

    await run(db,
      `UPDATE ot_requests SET status = 'rejected', reject_reason = ?, rejected_by = ? WHERE id = ?`,
      [reject_reason, req.user.id, req.params.id]);

    res.json({ ok: true });
  });

  return router;
}

module.exports = { getOTRoutes };
