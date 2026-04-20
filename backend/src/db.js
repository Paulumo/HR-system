// Database initialization and schema
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'hr-system.db');

function getDb() {
  return new sqlite3.Database(DB_PATH);
}

// Hash helper
async function hashPw(pw) {
  return bcrypt.hash(pw, 10);
}

async function checkPw(input, hash) {
  return bcrypt.compare(input, hash);
}

async function initDb() {
  const db = getDb();

  return new Promise((resolve, reject) => {
    db.serialize(async () => {

      // Users — split sensitive fields out
      await run(db, `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','manager','employee')),
        name_zh TEXT NOT NULL,
        name_en TEXT,
        dept TEXT NOT NULL,
        dept_en TEXT,
        title TEXT,
        title_en TEXT,
        hire_date TEXT,
        birthday TEXT,
        id_card_no TEXT,
        phone TEXT,
        emerg_name TEXT,
        emerg_phone TEXT,
        proxy_id TEXT REFERENCES users(id),
        manager_id TEXT REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Attendance / Clock records
      await run(db, `CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        clock_in TEXT,
        clock_out TEXT,
        overtime REAL DEFAULT 0,
        status TEXT DEFAULT 'normal' CHECK(status IN ('normal','late','supplement')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, date)
      )`);

      // Leave requests
      await run(db, `CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        applicant_id TEXT NOT NULL REFERENCES users(id),
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        hours REAL DEFAULT 8,
        reason TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reject_reason TEXT,
        rejected_by TEXT REFERENCES users(id)
      )`);

      // Approval chain log
      await run(db, `CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        request_type TEXT NOT NULL CHECK(request_type IN ('leave','supplement','ot')),
        approver_id TEXT NOT NULL REFERENCES users(id),
        approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(request_id, request_type, approver_id)
      )`);

      // Missed punch / Supplement requests
      await run(db, `CREATE TABLE IF NOT EXISTS supplement_requests (
        id TEXT PRIMARY KEY,
        applicant_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('in','out','both')),
        clock_in TEXT,
        clock_out TEXT,
        reason TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reject_reason TEXT,
        rejected_by TEXT REFERENCES users(id)
      )`);

      // Overtime requests
      await run(db, `CREATE TABLE IF NOT EXISTS ot_requests (
        id TEXT PRIMARY KEY,
        applicant_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        hours REAL NOT NULL,
        comp_type TEXT NOT NULL CHECK(comp_type IN ('comp','pay')),
        pay_amt INTEGER DEFAULT 0,
        reason TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reject_reason TEXT,
        rejected_by TEXT REFERENCES users(id)
      )`);

      // Comp time records
      await run(db, `CREATE TABLE IF NOT EXISTS comp_time (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES users(id),
        earned_date TEXT NOT NULL,
        hours REAL NOT NULL,
        source TEXT,
        used REAL DEFAULT 0,
        expiry TEXT,
        status TEXT DEFAULT 'available' CHECK(status IN ('available','used')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Shift types
      await run(db, `CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        label TEXT,
        time TEXT,
        short TEXT,
        color TEXT,
        hours REAL DEFAULT 0,
        is_work INTEGER DEFAULT 0,
        is_rest INTEGER DEFAULT 0,
        is_regular_off INTEGER DEFAULT 0,
        is_national INTEGER DEFAULT 0
      )`);

      // Schedule: employee -> date -> shift
      await run(db, `CREATE TABLE IF NOT EXISTS schedules (
        employee_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        shift_id TEXT NOT NULL REFERENCES shifts(id),
        PRIMARY KEY (employee_id, date)
      )`);

      // Audit log
      await run(db, `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Seed default shifts
      await seedShifts(db);

      // Seed initial users (will be migrated from prototype data)
      await seedUsers(db);

      resolve();
    });
  });
}

async function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function(err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function(err, row) {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function seedShifts(db) {
  const exists = await get(db, 'SELECT id FROM shifts LIMIT 1');
  if (exists) return;

  const shifts = [
    { id: 'day', label: '日班', time: '09:00-18:00', short: '日', color: '#F59E0B', hours: 8, is_work: 1 },
    { id: 'evening', label: '晚班', time: '14:00-22:00', short: '晚', color: '#F97316', hours: 8, is_work: 1 },
    { id: 'night', label: '夜班', time: '22:00-06:00', short: '夜', color: '#6366F1', hours: 8, is_work: 1 },
    { id: 'off', label: '休假', short: '休', color: '#9CA3AF', is_rest: 1 },
    { id: 'regular_off', label: '例假', short: '例', color: '#64748B', is_regular_off: 1 },
    { id: 'national', label: '國定假日', short: '國', color: '#DC2626', is_national: 1 },
  ];

  for (const s of shifts) {
    await run(db,
      `INSERT INTO shifts (id, label, time, short, color, hours, is_work, is_rest, is_regular_off, is_national)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.label, s.time||null, s.short||null, s.color, s.hours||0,
       s.is_work||0, s.is_rest||0, s.is_regular_off||0, s.is_national||0]
    );
  }
}

async function seedUsers(db) {
  const exists = await get(db, 'SELECT id FROM users LIMIT 1');
  if (exists) return;

  const defaultHash = await hashPw('1234');
  const adminHash = await hashPw('admin');

  // Only employees — no real PII in initial seed, just IDs/names/depts/roles
  // HR should populate full data via admin panel after first run
  const users = [
    { id: 'ADMIN', username: 'admin', password_hash: adminHash, role: 'admin', name_zh: '系統管理員', dept: '管理部' },
    { id: 'H001', username: 'H001', password_hash: defaultHash, role: 'manager', name_zh: '廖崇良', dept: '行政辦公室' },
    { id: 'H002', username: 'H002', password_hash: defaultHash, role: 'manager', name_zh: '簡哲章', dept: '機務' },
    { id: 'H005', username: 'H005', password_hash: defaultHash, role: 'employee', name_zh: '邱竹君', dept: '行政辦公室' },
    { id: 'H007', username: 'H007', password_hash: defaultHash, role: 'manager', name_zh: '周志賢', dept: '行政辦公室' },
    { id: 'H009', username: 'H009', password_hash: defaultHash, role: 'employee', name_zh: '張家瑋', dept: '航務' },
    { id: 'H011', username: 'H011', password_hash: defaultHash, role: 'manager', name_zh: '倪立宏', dept: '機務' },
    { id: 'H014', username: 'H014', password_hash: defaultHash, role: 'employee', name_zh: '林暐家', dept: '航務' },
    { id: 'H017', username: 'H017', password_hash: defaultHash, role: 'employee', name_zh: '莫宣毅', dept: '航務' },
    { id: 'H020', username: 'H020', password_hash: defaultHash, role: 'employee', name_zh: '許子峯', dept: '機務' },
    { id: 'H021', username: 'H021', password_hash: defaultHash, role: 'employee', name_zh: '劉人榤', dept: '機務' },
    { id: 'H022', username: 'H022', password_hash: defaultHash, role: 'employee', name_zh: '趙永毅', dept: '機務' },
    { id: 'H023', username: 'H023', password_hash: defaultHash, role: 'employee', name_zh: '黃翊軒', dept: '航務' },
    { id: 'H024', username: 'H024', password_hash: defaultHash, role: 'employee', name_zh: '蔣小龍', dept: '機務' },
    { id: 'H027', username: 'H027', password_hash: defaultHash, role: 'employee', name_zh: '洪友福', dept: '機務' },
    { id: 'H028', username: 'H028', password_hash: defaultHash, role: 'employee', name_zh: '黃國豪', dept: '機務' },
    { id: 'H029', username: 'H029', password_hash: defaultHash, role: 'employee', name_zh: '黃淵捷', dept: '航務' },
    { id: 'H030', username: 'H030', password_hash: defaultHash, role: 'employee', name_zh: '潘政國', dept: '機務' },
    { id: 'H031', username: 'H031', password_hash: defaultHash, role: 'employee', name_zh: '施靜汝', dept: '運營支援' },
    { id: 'H032', username: 'H032', password_hash: defaultHash, role: 'employee', name_zh: '廖苡淳', dept: '運營支援' },
    { id: 'H033', username: 'H033', password_hash: defaultHash, role: 'employee', name_zh: '林依霖', dept: '行政辦公室' },
    { id: 'H035', username: 'H035', password_hash: defaultHash, role: 'manager', name_zh: '葛倉豪', dept: '運營支援' },
    { id: 'H036', username: 'H036', password_hash: defaultHash, role: 'employee', name_zh: '陳玉霖', dept: '航務' },
    { id: 'H037', username: 'H037', password_hash: defaultHash, role: 'employee', name_zh: '張明致', dept: '運營支援' },
    { id: 'H038', username: 'H038', password_hash: defaultHash, role: 'employee', name_zh: '楊仁傑', dept: '運營支援' },
  ];

  // Update manager_id and proxy based on original prototype
  const updates = [
    { id: 'H001', proxy_id: 'H033' },
    { id: 'H002', manager_id: 'H001', proxy_id: 'H033' },
    { id: 'H005', manager_id: 'H007' },
    { id: 'H007', manager_id: 'H001', proxy_id: 'H033' },
    { id: 'H009', manager_id: 'H001' },
    { id: 'H011', manager_id: 'H001', proxy_id: 'H033' },
    { id: 'H014', manager_id: 'H001' },
    { id: 'H017', manager_id: 'H001' },
    { id: 'H020', manager_id: 'H011' },
    { id: 'H021', manager_id: 'H011' },
    { id: 'H022', manager_id: 'H011' },
    { id: 'H023', manager_id: 'H001' },
    { id: 'H024', manager_id: 'H011' },
    { id: 'H027', manager_id: 'H011' },
    { id: 'H028', manager_id: 'H011' },
    { id: 'H029', manager_id: 'H001' },
    { id: 'H030', manager_id: 'H011' },
    { id: 'H031', manager_id: 'H035' },
    { id: 'H032', manager_id: 'H035' },
    { id: 'H033', manager_id: 'H007' },
    { id: 'H035', manager_id: 'H001', proxy_id: 'H033' },
    { id: 'H036', manager_id: 'H001' },
    { id: 'H037', manager_id: 'H035' },
    { id: 'H038', manager_id: 'H035' },
  ];

  for (const u of users) {
    await run(db,
      `INSERT INTO users (id, username, password_hash, role, name_zh, dept)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [u.id, u.username, u.password_hash, u.role, u.name_zh, u.dept]
    );
  }

  for (const upd of updates) {
    await run(db,
      `UPDATE users SET manager_id = ?, proxy_id = ? WHERE id = ?`,
      [upd.manager_id || null, upd.proxy_id || null, upd.id]
    );
  }
}

module.exports = { getDb, initDb, run, all, get, hashPw, checkPw };
