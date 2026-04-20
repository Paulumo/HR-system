const { Router } = require('express');
const { getDb, all, get } = require('./db');
const { requireAuth } = require('./utils');

function getCompRoutes() {
  const router = Router();

  // GET /api/comp/my
  router.get('/comp/my', requireAuth, async (req, res) => {
    const db = getDb();
    const records = await all(db,
      `SELECT * FROM comp_time WHERE employee_id = ? ORDER BY earned_date DESC`,
      [req.user.id]);

    const totalEarned = records.reduce((s, r) => s + r.hours, 0);
    const totalUsed = records.reduce((s, r) => s + r.used, 0);

    res.json({ records, totalEarned, totalUsed, available: totalEarned - totalUsed });
  });

  return router;
}

module.exports = { getCompRoutes };
