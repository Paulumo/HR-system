import sqlite3, bcrypt, os

DB_PATH = os.path.join(os.path.dirname(__file__), 'hr-system.db')

def make_conn():
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    db = make_conn()
    db.executescript("""
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','manager','employee')),
    name_zh TEXT NOT NULL,
    name_en TEXT DEFAULT '',
    dept TEXT NOT NULL,
    dept_en TEXT DEFAULT '',
    title TEXT DEFAULT '',
    title_en TEXT DEFAULT '',
    hire_date TEXT DEFAULT '',
    birthday TEXT DEFAULT '',
    id_card_no TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    emerg_name TEXT DEFAULT '',
    emerg_phone TEXT DEFAULT '',
    proxy_id TEXT REFERENCES users(id),
    manager_id TEXT REFERENCES users(id),
    display_order INTEGER DEFAULT 0,
    annual_leave_entitlement REAL DEFAULT 7
);

CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    clock_in TEXT,
    clock_out TEXT,
    overtime REAL DEFAULT 0,
    status TEXT DEFAULT 'normal' CHECK(status IN ('normal','late','supplement','early')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    applicant_id TEXT NOT NULL REFERENCES users(id),
    leave_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    hours REAL DEFAULT 8,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reject_reason TEXT DEFAULT '',
    rejected_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK(request_type IN ('leave','supplement','ot')),
    approver_id TEXT NOT NULL,
    approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(request_id, request_type, approver_id)
);

CREATE TABLE IF NOT EXISTS supplement_requests (
    id TEXT PRIMARY KEY,
    applicant_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    clock_in TEXT DEFAULT '',
    clock_out TEXT DEFAULT '',
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reject_reason TEXT DEFAULT '',
    rejected_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ot_requests (
    id TEXT PRIMARY KEY,
    applicant_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    hours REAL NOT NULL,
    comp_type TEXT NOT NULL,
    pay_amt INTEGER DEFAULT 0,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reject_reason TEXT DEFAULT '',
    rejected_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS comp_time (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES users(id),
    earned_date TEXT NOT NULL,
    hours REAL NOT NULL,
    source TEXT,
    used REAL DEFAULT 0,
    expiry TEXT,
    status TEXT DEFAULT 'available' CHECK(status IN ('available','used'))
);

CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    label TEXT DEFAULT '',
    time TEXT DEFAULT '',
    short TEXT DEFAULT '',
    color TEXT DEFAULT '#9CA3AF',
    hours REAL DEFAULT 0,
    is_work INTEGER DEFAULT 0,
    is_rest INTEGER DEFAULT 0,
    is_regular_off INTEGER DEFAULT 0,
    is_national INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedules (
    employee_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    shift_id TEXT NOT NULL REFERENCES shifts(id),
    PRIMARY KEY (employee_id, date)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
""")
    _seed_shifts(db)
    _seed_users(db)
    db.commit()
    db.close()

def _seed_shifts(db):
    if db.execute("SELECT id FROM shifts LIMIT 1").fetchone():
        return
    shifts = [
        ('day', '日班', '09:00-18:00', '日', '#F59E0B', 8, 1, 0, 0, 0),
        ('evening', '晚班', '14:00-22:00', '晚', '#F97316', 8, 1, 0, 0, 0),
        ('night', '夜班', '22:00-06:00', '夜', '#6366F1', 8, 1, 0, 0, 0),
        ('off', '休假', '', '休', '#9CA3AF', 0, 0, 1, 0, 0),
        ('regular_off', '例假', '', '例', '#64748B', 0, 0, 0, 1, 0),
        ('national', '國定假日', '', '國', '#DC2626', 0, 0, 0, 0, 1),
    ]
    db.executemany("INSERT INTO shifts VALUES (?,?,?,?,?,?,?,?,?,?)", shifts)

def _seed_users(db):
    if db.execute("SELECT id FROM users LIMIT 1").fetchone():
        return

    pw_def = bcrypt.hashpw('1234'.encode(), bcrypt.gensalt()).decode()
    pw_adm = bcrypt.hashpw('admin'.encode(), bcrypt.gensalt()).decode()

    users = [
        ('ADMIN','admin',pw_adm,'admin','系統管理員','Admin','管理部','Admin','系統管理員','System Admin'),
        ('H001','H001',pw_def,'manager','廖崇良','Steven Liao','行政辦公室','Exec Office','副總經理(兼總經理)','VP(Acting GM)'),
        ('H002','H002',pw_def,'manager','簡哲章','Jason Chien','機務','E&M','品保處長','Director QA'),
        ('H005','H005',pw_def,'employee','邱竹君','Sophie Chiu','行政辦公室','Exec Office','危險品管理師','DG Specialist'),
        ('H007','H007',pw_def,'manager','周志賢','Perry Chou','行政辦公室','Exec Office','企業安全處長','Dir. Safety'),
        ('H009','H009',pw_def,'employee','張家瑋','Martin Chang','航務','Flight Ops','培訓機師','Cadet Pilot'),
        ('H011','H011',pw_def,'manager','倪立宏','Nick Ni','機務','E&M','機務處長','Dir. E&M'),
        ('H014','H014',pw_def,'employee','林暐家','Greeco Lin','航務','Flight Ops','飛行員','Pilot'),
        ('H017','H017',pw_def,'employee','莫宣毅','Paul Mo','航務','Flight Ops','吊掛手','Hoist Op'),
        ('H020','H020',pw_def,'employee','許子峯','Dick Hsu','機務','E&M','適航工程師','CAMO Eng'),
        ('H021','H021',pw_def,'employee','劉人榤','Angus Liu','機務','E&M','工程師','Maint. Eng'),
        ('H022','H022',pw_def,'employee','趙永毅','Stan Chao','機務','E&M','工程師','Maint. Eng'),
        ('H023','H023',pw_def,'employee','黃翊軒','Dennis Huang','航務','Flight Ops','吊掛手','Hoist Op'),
        ('H024','H024',pw_def,'employee','蔣小龍','Bruce Chiang','機務','E&M','工程師','Maint. Eng'),
        ('H027','H027',pw_def,'employee','洪友福','Steven Hong','機務','E&M','適航工程師','CAMO Eng'),
        ('H028','H028',pw_def,'employee','黃國豪','Chad Huang','機務','E&M','維修員','Technician'),
        ('H029','H029',pw_def,'employee','黃淵捷','Jay Huang','航務','Flight Ops','培訓機師','Cadet Pilot'),
        ('H030','H030',pw_def,'employee','潘政國','Pan Pan','機務','E&M','維修員','Technician'),
        ('H031','H031',pw_def,'employee','施靜汝','Bonnie Shih','運營支援','Op Support','運營支援助理','Op Asst'),
        ('H032','H032',pw_def,'employee','廖苡淳','Evan Liao','運營支援','Op Support','運營支援助理','Op Asst'),
        ('H033','H033',pw_def,'employee','林依霖','Echo Lin','行政辦公室','Exec Office','人資經理','HR Mgr'),
        ('H035','H035',pw_def,'manager','葛倉豪','Billy Ke','運營支援','Op Support','運營支援經理','Op Mgr'),
        ('H036','H036',pw_def,'employee','陳玉霖','Dennis Chen','航務','Flight Ops','飛行員','Pilot'),
        ('H037','H037',pw_def,'employee','張明致','Ming Chang','運營支援','Op Support','運營支援助理','Op Asst'),
        ('H038','H038',pw_def,'employee','楊仁傑','Charles Yang','運營支援','Op Support','運營支援助理','Op Asst'),
    ]

    db.executemany(
        "INSERT INTO users (id,username,password_hash,role,name_zh,name_en,dept,dept_en,title,title_en) VALUES (?,?,?,?,?,?,?,?,?,?)",
        users)

    # Set proxy_id and manager_id via UPDATE (all users exist now, FK resolves)
    for uid, pid in {'H001':'H033','H002':'H033','H007':'H033','H011':'H033','H035':'H033'}.items():
        db.execute("UPDATE users SET proxy_id=? WHERE id=?", (pid, uid))
    for uid, mid in {
        'H005':'H007','H009':'H001','H014':'H001','H017':'H001',
        'H020':'H011','H021':'H011','H022':'H011','H023':'H001',
        'H024':'H011','H027':'H011','H028':'H011','H029':'H001',
        'H030':'H011','H031':'H035','H032':'H035','H033':'H007',
        'H036':'H001','H037':'H035','H038':'H035',
    }.items():
        db.execute("UPDATE users SET manager_id=? WHERE id=?", (mid, uid))
    db.commit()
