const { Router } = require('express');
const { getDb, all, get, run } = require('./db');
const { requireAuth, genId } = require('./utils');

// Reuse approval logic
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

function getSupplementRoutes() {
  const router = Router();

  // GET /api/supplements/my
  router.get('/supplements/my', requireAuth, async (req, res) => {
    const db = getDb();
    const records = await all(db,
      `SELECT * FROM supplement_requests WHERE applicant_id = ? ORDER BY created_at DESC`,
      [req.user.id]);
    res.json({ records });
  });

  // POST /api/supplements — submit missed punch request
  router.post('/supplements', requireAuth, async (req, res) => {
    const { date, type, clock_in, clock_out, reason } = req.body;
    if (!date || !type || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = genId('SP');
    const db = getDb();
    await run(db,
      `INSERT INTO supplement_requests (id, applicant_id, date, type, clock_in, clock_out, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, date, type, clock_in || null, clock_out || null, reason]);

    res.json({ ok: true, id });
  });

  // GET /api/supplements/pending — approval queue
  router.get('/supplements/pending', requireAuth, async (req, res) => {
    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const records = await all(db,
      `SELECT sr.*, u.name_zh, u.dept FROM supplement_requests sr JOIN users u ON sr.applicant_id = u.id
       WHERE sr.status = 'pending' ORDER BY sr.created_at ASC`);

    const myTurn = records.filter(r => canApprove(r, req.user, users));
    const mine = records.filter(r => r.applicant_id === req.user.id);

    const history = await all(db,
      `SELECT sr.*, u.name_zh FROM supplement_requests sr JOIN users u ON sr.applicant_id = u.id
       WHERE sr.status != 'pending' ORDER BY sr.created_at DESC LIMIT 50`);

    res.json({ myTurn, myPending: mine, history });
  });

  // POST /api/supplements/:id/approve
  router.post('/supplements/:id/approve', requireAuth, async (req, res) => {
    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const record = await get(db, 'SELECT * FROM supplement_requests WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Not found' });

    if (!canApprove(record, req.user, users)) {
      return res.status(403).json({ error: 'Not your turn to approve' });
    }

    await run(db,
      `INSERT OR IGNORE INTO approvals (request_id, request_type, approver_id) VALUES (?, ?, ?)`,
      [req.params.id, 'supplement', req.user.id]);

    const approvals = await all(db, 'SELECT COUNT(*) as cnt FROM approvals WHERE request_id = ? AND request_type = ?', [req.params.id, 'supplement']);
    const chain = getApprovalChain(record.applicant_id, users);

    if (approvals[0].cnt >= chain.length) {
      await run(db, 'UPDATE supplement_requests SET status = ? WHERE id = ?', ['approved', req.params.id]);

      // Apply to attendance record
      const existing = await get(db, 'SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [record.applicant_id, record.date]);
      if (existing) {
        const updates = [];
        const params = [];
        if (record.clock_in) { updates.push('clock_in = ?'); params.push(record.clock_in); }
        if (record.clock_out) { updates.push('clock_out = ?'); params.push(record.clock_out); }
        params.push('supplement', existing.id);
        if (updates.length) {
          await run(db, `UPDATE attendance SET ${updates.join(', ')}, status = ? WHERE id = ?`, params);
        }
      } else {
        const attId = genId('C');
        await run(db,
          `INSERT INTO attendance (id, employee_id, date, clock_in, clock_out, overtime, status)
           VALUES (?, ?, ?, ?, ?, 0, 'supplement')`,
          [attId, record.applicant_id, record.date, record.clock_in || '09:00', record.clock_out || null]);
      }
    }

    res.json({ ok: true });
  });

  // POST /api/supplements/:id/reject
  router.post('/supplements/:id/reject', requireAuth, async (req, res) => {
    const { reject_reason } = req.body;
    if (!reject_reason) return res.status(400).json({ error: 'Reject reason required' });

    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const record = await get(db, 'SELECT * FROM supplement_requests WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Not found' });

    if (!canApprove(record, req.user, users)) {
      return res.status(403).json({ error: 'Not your turn to reject' });
    }

    await run(db,
      `UPDATE supplement_requests SET status = 'rejected', reject_reason = ?, rejected_by = ? WHERE id = ?`,
      [reject_reason, req.user.id, req.params.id]);

    res.json({ ok: true });
  });

  return router;
}

module.exports = { getSupplementRoutes };
