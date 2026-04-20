const { Router } = require('express');
const { getDb, all, get, run } = require('./db');
const { requireAuth, genId } = require('./utils');

// Approval chain logic (same as frontend but server-side, unforgeable)
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
  const chain = getApprovalChain(request.applicant_id || request.employee_id, users);
  const step = request.current_step || 0;
  if (step >= chain.length) return false;
  const nextApprover = chain[step];
  return currentUser.id === nextApprover || currentUser.role === 'admin';
}

function getLeaveRoutes() {
  const router = Router();

  // GET /api/leaves/my — current user's leave requests
  router.get('/leaves/my', requireAuth, async (req, res) => {
    const db = getDb();
    const requests = await all(db,
      `SELECT * FROM leave_requests WHERE applicant_id = ? ORDER BY created_at DESC`,
      [req.user.id]);

    // Get approval counts
    const approvals = await all(db,
      `SELECT request_id, COUNT(*) as cnt FROM approvals WHERE request_type = 'leave' GROUP BY request_id`);
    const approvalMap = {};
    approvals.forEach(a => { approvalMap[a.request_id] = a.cnt; });

    const result = requests.map(r => ({
      ...r,
      approvals_count: approvalMap[r.id] || 0
    }));

    res.json({ requests: result });
  });

  // POST /api/leaves — submit leave request
  router.post('/leaves', requireAuth, async (req, res) => {
    const { leave_type, start_date, end_date, hours, reason } = req.body;
    if (!leave_type || !start_date || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (hours <= 0 || hours > 16) {
      return res.status(400).json({ error: 'Invalid hours' });
    }

    const id = genId('L');
    const db = getDb();
    await run(db,
      `INSERT INTO leave_requests (id, applicant_id, leave_type, start_date, end_date, hours, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, leave_type, start_date, end_date || start_date, hours, reason]);

    res.json({ ok: true, id });
  });

  // GET /api/leaves/pending — items needing approval (for managers/HR/VP)
  router.get('/leaves/pending', requireAuth, async (req, res) => {
    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const requests = await all(db,
      `SELECT lr.*, u.name_zh, u.dept FROM leave_requests lr JOIN users u ON lr.applicant_id = u.id
       WHERE lr.status = 'pending' ORDER BY lr.created_at ASC`);

    const myTurn = requests.filter(r => canApprove(r, req.user, users));
    const mine = requests.filter(r => r.applicant_id === req.user.id);

    const others = await all(db,
      `SELECT lr.*, u.name_zh, u.status FROM leave_requests lr JOIN users u ON lr.applicant_id = u.id
       WHERE lr.status != 'pending' ORDER BY lr.created_at DESC LIMIT 50`);

    res.json({ myTurn, myPending: mine, history: others });
  });

  // POST /api/leaves/:id/approve
  router.post('/leaves/:id/approve', requireAuth, async (req, res) => {
    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const request = await get(db, 'SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Not found' });

    if (!canApprove(request, req.user, users)) {
      return res.status(403).json({ error: 'Not your turn to approve' });
    }

    // Check not self-approving
    if (request.applicant_id === req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Cannot approve own request' });
    }

    // Add approval
    await run(db,
      `INSERT OR IGNORE INTO approvals (request_id, request_type, approver_id) VALUES (?, ?, ?)`,
      [req.params.id, 'leave', req.user.id]);

    const chain = getApprovalChain(request.applicant_id, users);
    const approvals = await all(db, 'SELECT * FROM approvals WHERE request_id = ? AND request_type = ?', [req.params.id, 'leave']);

    if (approvals.length >= chain.length) {
      await run(db, 'UPDATE leave_requests SET status = ? WHERE id = ?', ['approved', req.params.id]);
    }

    res.json({ ok: true });
  });

  // POST /api/leaves/:id/reject
  router.post('/leaves/:id/reject', requireAuth, async (req, res) => {
    const { reject_reason } = req.body;
    if (!reject_reason) return res.status(400).json({ error: 'Reject reason required' });

    const db = getDb();
    const users = await all(db, 'SELECT id, role, manager_id FROM users');
    const request = await get(db, 'SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Not found' });

    if (!canApprove(request, req.user, users)) {
      return res.status(403).json({ error: 'Not your turn to reject' });
    }

    await run(db,
      `UPDATE leave_requests SET status = 'rejected', reject_reason = ?, rejected_by = ? WHERE id = ?`,
      [reject_reason, req.user.id, req.params.id]);

    res.json({ ok: true });
  });

  return router;
}

module.exports = { getLeaveRoutes };
