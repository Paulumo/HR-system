import os, re, uuid, bcrypt
from datetime import datetime, date
from flask import Flask, request, session, jsonify, send_from_directory, g
from db import init_db, make_conn

FRONTEND = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
app = Flask(__name__, static_folder=FRONTEND, static_url_path='/frontend')

def get_db():
    if 'db' not in g:
        g.db = make_conn()
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

@app.route('/')
def index():
    return send_from_directory(ROOT, 'index.html')

app.secret_key = os.environ.get('SECRET_KEY', 'change-this-before-production')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 28800  # 8h

def gen_id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"

def get_approval_chain(applicant_id, users):
    u = next((x for x in users if x['id'] == applicant_id), None)
    if not u: return []
    def get_u(uid):
        target = next((x for x in users if x['id'] == uid), None)
        return {'id': uid, 'name': target['name_zh'] if target else uid}
    chain_ids = []
    if u['role'] == 'manager':
        chain_ids = ['H033'] if u['id'] == 'H001' else ['H001', 'H033']
    else:
        mgr = u.get('manager_id')
        chain_ids = [mgr] if mgr else ['H033', 'H001']
        if mgr != 'H033': chain_ids.append('H033')
        if mgr != 'H001': chain_ids.append('H001')
    seen = set()
    final = []
    for cid in chain_ids:
        if cid and cid not in seen:
            final.append(get_u(cid))
            seen.add(cid)
    return final

def add_wf_info(records, users, rtype):
    db = get_db()
    ids = [r['id'] for r in records]
    if not ids:
        for r in records: r['approval_chain'] = get_approval_chain(r['applicant_id'], users)
        return records
    ph = ','.join('?' * len(ids))
    rows = db.execute(f"SELECT request_id, COUNT(*) as cnt FROM approvals WHERE request_type = ? AND request_id IN ({ph}) GROUP BY request_id", [rtype] + ids).fetchall()
    amap = {r['request_id']: r['cnt'] for r in rows}
    for r in records:
        r['approval_count'] = amap.get(r['id'], 0)
        r['approval_chain'] = get_approval_chain(r['applicant_id'], users)
    return records

def can_approve(req_data, user, users):
    if req_data['status'] != 'pending': return False
    chain = get_approval_chain(req_data['applicant_id'], users)
    step = req_data.get('approval_count', 0)
    if step >= len(chain): return False
    return user['id'] == chain[step]['id'] or user['role'] == 'admin'

def require_auth(fn):
    from functools import wraps
    @wraps(fn)
    def wrapper(*a, **kw):
        uid = session.get('user_id')
        if not uid: return jsonify({'error': 'Not authenticated'}), 401
        db = get_db()
        row = db.execute('SELECT * FROM users WHERE id = ?', [uid]).fetchone()
        if not row: return jsonify({'error': 'Not authenticated'}), 401
        request.user = dict(row)
        return fn(*a, **kw)
    return wrapper

def get_user_full_info(user_row):
    if not user_row: return None
    try:
        u = dict(user_row)
        u.pop('password_hash', None)
        db = get_db()
        
        # Calculate Annual Leave Balance
        used_row = db.execute("SELECT SUM(hours) as s FROM leave_requests WHERE applicant_id = ? AND leave_type = 'annual' AND status = 'approved'", [u['id']]).fetchone()
        used_hours = used_row['s'] or 0
        
        # entitlement from users table (default 7 days if null)
        # Directly fetch from DB to be absolutely sure we have the latest and correct column
        db_user = db.execute("SELECT annual_leave_entitlement FROM users WHERE id = ?", [u['id']]).fetchone()
        ent_days = db_user['annual_leave_entitlement'] if db_user and db_user['annual_leave_entitlement'] is not None else 7
        
        ent_hours = ent_days * 8
        u['annual_leave_balance_hours'] = ent_hours - used_hours
        u['annual_leave_entitlement'] = ent_days # Also return the raw entitlement
        
        print(f"DEBUG User {u['id']}: Entitlement={ent_days}d, Used={used_hours}h, Balance={u['annual_leave_balance_hours']}h")
        
        # Calculate OT hours (automatic from attendance + approved requests) for this month
        today = date.today()
        start_of_month = date(today.year, today.month, 1).isoformat()
        
        # 1. Automatic OT from attendance table
        auto_ot_row = db.execute("SELECT SUM(overtime) as s FROM attendance WHERE employee_id = ? AND date >= ?", [u['id'], start_of_month]).fetchone()
        auto_ot = auto_ot_row['s'] or 0
        
        # 2. Approved OT requests
        req_ot_row = db.execute("SELECT SUM(hours) as s FROM ot_requests WHERE applicant_id = ? AND status = 'approved' AND date >= ?", [u['id'], start_of_month]).fetchone()
        req_ot = req_ot_row['s'] or 0
        
        u['ot_hours_total_month'] = auto_ot + req_ot
        
        # Get today's shift
        today_iso = today.isoformat()
        shift = db.execute("SELECT sh.* FROM schedules s JOIN shifts sh ON s.shift_id = sh.id WHERE s.employee_id = ? AND s.date = ?", [u['id'], today_iso]).fetchone()
        u['today_shift'] = dict(shift) if shift else None
        
        return u
    except Exception as e:
        print(f"Error in get_user_full_info: {e}")
        # Fallback to basic info if DB calls fail
        u = dict(user_row)
        u.pop('password_hash', None)
        return u

# ---------- Auth ----------
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json or {}
    username, password = data.get('username','').strip(), data.get('password','')
    db = get_db()
    row = db.execute('SELECT * FROM users WHERE username = ?', [username]).fetchone()
    if not row or not bcrypt.checkpw(password.encode(), row['password_hash'].encode()):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    user = get_user_full_info(row)
    session['user_id'] = user['id']
    return jsonify({'user': user})

@app.route('/api/auth/change-password', methods=['POST'])
def api_change_password():
    data = request.json or {}
    u = data.get('username', '').strip()
    old_p = data.get('old_password', '')
    new_p = data.get('new_password', '')
    
    if not u or not old_p or not new_p:
        return jsonify({'error': 'All fields are required'}), 400
    
    db = get_db()
    row = db.execute('SELECT * FROM users WHERE username = ?', [u]).fetchone()
    if not row:
        return jsonify({'error': 'User not found'}), 404
    
    if not bcrypt.checkpw(old_p.encode(), row['password_hash'].encode()):
        return jsonify({'error': 'Current password incorrect'}), 401
    
    new_hash = bcrypt.hashpw(new_p.encode(), bcrypt.gensalt()).decode()
    db.execute("UPDATE users SET password_hash = ? WHERE username = ?", [new_hash, u])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'ok': True})

@app.route('/api/auth/me', methods=['GET'])
@require_auth
def api_me():
    return jsonify({'user': get_user_full_info(request.user)})

# ---------- Attendance ----------
@app.route('/api/attendance/my', methods=['GET'])
@require_auth
def att_my():
    db = get_db()
    rows = db.execute('SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 31', [request.user['id']]).fetchall()
    return jsonify({'records': [dict(r) for r in rows]})

@app.route('/api/attendance/manual', methods=['POST'])
@require_auth
def api_att_manual():
    db = get_db()
    try:
        d = request.json or {}
        dt = d.get('date')
        if not dt: return jsonify({'error': 'Date is required'}), 400

        ci = d.get('clock_in')
        co = d.get('clock_out')

        existing = db.execute('SELECT * FROM attendance WHERE employee_id=? AND date=?', [request.user['id'], dt]).fetchone()

        # Use existing if not provided in request
        final_in = ci if ci is not None else (existing['clock_in'] if existing else None)
        final_out = co if co is not None else (existing['clock_out'] if existing else None)

        # Default status for manual override
        status = 'supplement'
        ot = 0

        sched = db.execute("SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?", [request.user['id'], dt]).fetchone()

        if sched and sched['time'] and '-' in sched['time']:
            try:
                parts = sched['time'].split('-')
                if len(parts) == 2:
                    start_str, end_str = parts

                    # Late check (only if we are updating clock_in or it was already there)
                    if final_in:
                        sh, sm = map(int, start_str.split(':'))
                        ih, im = map(int, final_in.split(':'))
                        if (ih * 60 + im) > (sh * 60 + sm + 5):
                            status = 'late'
                        else:
                            status = 'normal'

                    # OT check (only if we have clock_out)
                    if final_out:
                        eh, em = map(int, end_str.split(':'))
                        oh, om = map(int, final_out.split(':'))
                        out_min = oh * 60 + om
                        sched_min = eh * 60 + em

                        if out_min > (sched_min + 30):
                            ot = round((out_min - sched_min) / 60, 1)
            except Exception as e:
                print(f"OT calc error: {e}")
                pass

        if existing:
            db.execute("UPDATE attendance SET clock_in = ?, clock_out = ?, overtime = ?, status = ? WHERE id = ?", [final_in, final_out, ot, status, existing['id']])
        else:
            db.execute("INSERT INTO attendance (id, employee_id, date, clock_in, clock_out, overtime, status) VALUES (?,?,?,?,?,?,?)",
                       [gen_id('C'), request.user['id'], dt, final_in, final_out, ot, status])

        db.commit()
        return jsonify({'ok': True})
    except Exception as e:
        print(f"Manual punch error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/attendance/clock-in', methods=['POST'])
@require_auth
def clock_in():
    dt = date.today().isoformat()
    now = datetime.now()
    t = now.strftime('%H:%M')
    db = get_db()
    existing = db.execute('SELECT id FROM attendance WHERE employee_id=? AND date=?', [request.user['id'], dt]).fetchone()
    if existing:
        return jsonify({'error': 'Already clocked in'}), 400
    
    sched = db.execute("SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?", [request.user['id'], dt]).fetchone()
    status = 'normal'
    if sched and sched['time'] and '-' in sched['time']:
        start_str = sched['time'].split('-')[0]
        try:
            sh, sm = map(int, start_str.split(':'))
            # Late if clocked in more than 5 minutes after shift start
            if (now.hour * 60 + now.minute) > (sh * 60 + sm + 5):
                status = 'late'
        except: pass
    
    db.execute("INSERT INTO attendance (id, employee_id, date, clock_in, status) VALUES (?,?,?,?,?)", [gen_id('C'), request.user['id'], dt, t, status])
    db.commit()
    return jsonify({'ok': True, 'time': t})

@app.route('/api/attendance/clock-out', methods=['POST'])
@require_auth
def clock_out():
    dt = date.today().isoformat()
    now = datetime.now()
    t = now.strftime('%H:%M')
    db = get_db()
    rec = db.execute('SELECT * FROM attendance WHERE employee_id=? AND date=?', [request.user['id'], dt]).fetchone()
    if not rec or rec['clock_out']:
        return jsonify({'error': 'No active clock-in found'}), 400
    
    ot = 0
    status = rec['status']
    sched = db.execute("SELECT s.* FROM schedules sc JOIN shifts s ON sc.shift_id = s.id WHERE sc.employee_id = ? AND sc.date = ?", [request.user['id'], dt]).fetchone()
    if sched and sched['time'] and '-' in sched['time']:
        try:
            end_str = sched['time'].split('-')[1]
            eh, em = map(int, end_str.split(':'))
            now_min = now.hour * 60 + now.minute
            sched_min = eh * 60 + em
            
            # Leave early if clocked out more than 5 minutes before shift end
            if now_min < (sched_min - 5):
                status = 'early'
            
            # Calculate OT if clocked out at least 30 minutes after shift end
            if now_min > (sched_min + 30):
                ot = round((now_min - sched_min) / 60, 1)
        except: pass
            
    db.execute("UPDATE attendance SET clock_out = ?, overtime = ?, status = ? WHERE id = ?", [t, ot, status, rec['id']])
    db.commit()
    return jsonify({'ok': True, 'time': t, 'overtime': ot})

# ---------- Workflows (Generic) ----------
def _approve(db, req_id, user, users, rtype, table, on_approved):
    row = db.execute(f'SELECT * FROM {table} WHERE id = ?', [req_id]).fetchone()
    if not row: return {'error': 'Not found'}, 404
    r = dict(row)
    ids = [r['id'] for r in [r]]
    ph = ','.join('?' * len(ids))
    count = db.execute(f"SELECT COUNT(*) as c FROM approvals WHERE request_type=? AND request_id=?", [rtype, req_id]).fetchone()['c']
    r['approval_count'] = count
    if not can_approve(r, user, users): return {'error': "Not your turn"}, 403
    db.execute("INSERT OR IGNORE INTO approvals (request_id, request_type, approver_id) VALUES (?,?,?)", [req_id, rtype, user['id']])
    new_count = db.execute(f"SELECT COUNT(*) as c FROM approvals WHERE request_id=? AND request_type=?", [req_id, rtype]).fetchone()['c']
    chain = get_approval_chain(r['applicant_id'], users)
    if new_count >= len(chain):
        db.execute(f"UPDATE {table} SET status = 'approved' WHERE id = ?", [req_id])
        on_approved(r, db)
    db.commit(); return {'ok': True}, 200

def _reject(db, req_id, user, users, reason, table):
    row = db.execute(f'SELECT * FROM {table} WHERE id = ?', [req_id]).fetchone()
    if not row: return {'error': 'Not found'}, 404
    r = dict(row)
    count = db.execute(f"SELECT COUNT(*) as c FROM approvals WHERE request_type IN ('leave','supplement','ot') AND request_id=?", [req_id]).fetchone()['c']
    r['approval_count'] = count
    if not can_approve(r, user, users): return {'error': "Not your turn"}, 403
    db.execute(f"UPDATE {table} SET status = 'rejected', reject_reason = ?, rejected_by = ? WHERE id = ?", [reason, user['id'], req_id])
    db.commit(); return {'ok': True}, 200

# ---------- Leave ----------
@app.route('/api/leaves/my', methods=['GET'])
@require_auth
def leave_my():
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    rows = db.execute('SELECT * FROM leave_requests WHERE applicant_id = ? ORDER BY created_at DESC', [request.user['id']]).fetchall()
    return jsonify({'requests': add_wf_info([dict(r) for r in rows], users, 'leave')})

@app.route('/api/leaves', methods=['POST'])
@require_auth
def leave_submit():
    d = request.json or {}
    db = get_db()
    db.execute("INSERT INTO leave_requests (id, applicant_id, leave_type, start_date, end_date, hours, reason) VALUES (?,?,?,?,?,?,?)",
               [gen_id('L'), request.user['id'], d.get('leave_type'), d.get('start_date'), d.get('end_date'), d.get('hours',8), d.get('reason')])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/leaves/pending', methods=['GET'])
@require_auth
def leave_pending():
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    pending = db.execute("SELECT lr.*, u.name_zh, u.dept FROM leave_requests lr JOIN users u ON lr.applicant_id = u.id WHERE lr.status = 'pending' ORDER BY lr.created_at ASC").fetchall()
    prec = add_wf_info([dict(r) for r in pending], users, 'leave')
    my_turn = [r for r in prec if can_approve(r, request.user, users)]
    mine = [r for r in prec if r['applicant_id'] == request.user['id']]
    
    # Filter history by permission
    if request.user['role'] == 'admin':
        hist_rows = db.execute("SELECT lr.*, u.name_zh FROM leave_requests lr JOIN users u ON lr.applicant_id = u.id WHERE lr.status != 'pending' ORDER BY lr.created_at DESC LIMIT 50").fetchall()
    elif request.user['role'] == 'manager':
        hist_rows = db.execute("SELECT lr.*, u.name_zh FROM leave_requests lr JOIN users u ON lr.applicant_id = u.id WHERE lr.status != 'pending' AND u.dept = ? ORDER BY lr.created_at DESC LIMIT 50", [request.user['dept']]).fetchall()
    else:
        hist_rows = db.execute("SELECT lr.*, u.name_zh FROM leave_requests lr JOIN users u ON lr.applicant_id = u.id WHERE lr.status != 'pending' AND lr.applicant_id = ? ORDER BY lr.created_at DESC LIMIT 50", [request.user['id']]).fetchall()
    
    return jsonify({'myTurn': my_turn, 'myPending': mine, 'history': [dict(h) for h in hist_rows]})

@app.route('/api/leaves/<req_id>/approve', methods=['POST'])
@require_auth
def leave_approve(req_id):
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    
    def on_app(r, db):
        if r['leave_type'] == 'comp':
            # Deduct from comp_time records (FIFO)
            needed = r['hours']
            recs = db.execute("SELECT * FROM comp_time WHERE employee_id = ? AND status = 'available' ORDER BY earned_date ASC", [r['applicant_id']]).fetchall()
            for row in recs:
                if needed <= 0: break
                avail = row['hours'] - row['used']
                if avail <= 0: continue
                
                take = min(needed, avail)
                new_used = row['used'] + take
                new_status = 'used' if new_used >= row['hours'] else 'available'
                db.execute("UPDATE comp_time SET used = ?, status = ? WHERE id = ?", [new_used, new_status, row['id']])
                needed -= take

    res, code = _approve(db, req_id, request.user, users, 'leave', 'leave_requests', on_app)
    return jsonify(res), code

@app.route('/api/leaves/<req_id>/reject', methods=['POST'])
@require_auth
def leave_reject(req_id):
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    res, code = _reject(db, req_id, request.user, users, (request.json or {}).get('reject_reason',''), 'leave_requests')
    return jsonify(res), code

# ---------- Supplement ----------
@app.route('/api/supplements/my', methods=['GET'])
@require_auth
def supp_my():
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    rows = db.execute('SELECT * FROM supplement_requests WHERE applicant_id = ? ORDER BY created_at DESC', [request.user['id']]).fetchall()
    return jsonify({'records': add_wf_info([dict(r) for r in rows], users, 'supplement')})

@app.route('/api/supplements', methods=['POST'])
@require_auth
def supp_submit():
    d = request.json or {}
    db = get_db()
    db.execute("INSERT INTO supplement_requests (id, applicant_id, date, type, clock_in, clock_out, reason) VALUES (?,?,?,?,?,?,?)",
               [gen_id('SP'), request.user['id'], d.get('date'), d.get('type'), d.get('clock_in',''), d.get('clock_out',''), d.get('reason')])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/supplements/pending', methods=['GET'])
@require_auth
def supp_pending():
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    pending = db.execute("SELECT sr.*, u.name_zh, u.dept FROM supplement_requests sr JOIN users u ON sr.applicant_id = u.id WHERE sr.status = 'pending' ORDER BY sr.created_at ASC").fetchall()
    prec = add_wf_info([dict(r) for r in pending], users, 'supplement')
    my_turn = [r for r in prec if can_approve(r, request.user, users)]
    mine = [r for r in prec if r['applicant_id'] == request.user['id']]
    
    # Filter history by permission
    if request.user['role'] == 'admin':
        hist_rows = db.execute("SELECT sr.*, u.name_zh FROM supplement_requests sr JOIN users u ON sr.applicant_id = u.id WHERE sr.status != 'pending' ORDER BY sr.created_at DESC LIMIT 50").fetchall()
    elif request.user['role'] == 'manager':
        hist_rows = db.execute("SELECT sr.*, u.name_zh FROM supplement_requests sr JOIN users u ON sr.applicant_id = u.id WHERE sr.status != 'pending' AND u.dept = ? ORDER BY sr.created_at DESC LIMIT 50", [request.user['dept']]).fetchall()
    else:
        hist_rows = db.execute("SELECT sr.*, u.name_zh FROM supplement_requests sr JOIN users u ON sr.applicant_id = u.id WHERE sr.status != 'pending' AND sr.applicant_id = ? ORDER BY sr.created_at DESC LIMIT 50", [request.user['id']]).fetchall()
    
    return jsonify({'myTurn': my_turn, 'myPending': mine, 'history': [dict(h) for h in hist_rows]})

@app.route('/api/supplements/<req_id>/approve', methods=['POST'])
@require_auth
def supp_approve(req_id):
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    def on_app(r, db):
        db.execute("INSERT INTO attendance (id, employee_id, date, clock_in, clock_out, overtime, status) VALUES (?,?,?,?,?,0,'supplement') ON CONFLICT(employee_id, date) DO UPDATE SET clock_in=excluded.clock_in, clock_out=excluded.clock_out, status='supplement'",
                   [gen_id('C'), r['applicant_id'], r['date'], r['clock_in'] or '09:00', r['clock_out'] or None])
    res, code = _approve(db, req_id, request.user, users, 'supplement', 'supplement_requests', on_app)
    return jsonify(res), code

# ---------- Overtime ----------
@app.route('/api/overtime/my', methods=['GET'])
@require_auth
def ot_my():
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    rows = db.execute('SELECT * FROM ot_requests WHERE applicant_id = ? ORDER BY created_at DESC', [request.user['id']]).fetchall()
    return jsonify({'records': add_wf_info([dict(r) for r in rows], users, 'ot')})

@app.route('/api/overtime', methods=['POST'])
@require_auth
def ot_submit():
    d = request.json or {}
    db = get_db()
    db.execute("INSERT INTO ot_requests (id, applicant_id, date, hours, comp_type, reason) VALUES (?,?,?,?,?,?)",
               [gen_id('OT'), request.user['id'], d.get('date'), d.get('hours'), d.get('comp_type'), d.get('reason')])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/overtime/pending', methods=['GET'])
@require_auth
def ot_pending():
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    pending = db.execute("SELECT o.*, u.name_zh, u.dept FROM ot_requests o JOIN users u ON o.applicant_id = u.id WHERE o.status = 'pending' ORDER BY o.created_at ASC").fetchall()
    prec = add_wf_info([dict(r) for r in pending], users, 'ot')
    my_turn = [r for r in prec if can_approve(r, request.user, users)]
    mine = [r for r in prec if r['applicant_id'] == request.user['id']]
    
    # Filter history by permission
    if request.user['role'] == 'admin':
        hist_rows = db.execute("SELECT o.*, u.name_zh FROM ot_requests o JOIN users u ON o.applicant_id = u.id WHERE o.status != 'pending' ORDER BY o.created_at DESC LIMIT 50").fetchall()
    elif request.user['role'] == 'manager':
        hist_rows = db.execute("SELECT o.*, u.name_zh FROM ot_requests o JOIN users u ON o.applicant_id = u.id WHERE o.status != 'pending' AND u.dept = ? ORDER BY o.created_at DESC LIMIT 50", [request.user['dept']]).fetchall()
    else:
        hist_rows = db.execute("SELECT o.*, u.name_zh FROM ot_requests o JOIN users u ON o.applicant_id = u.id WHERE o.status != 'pending' AND o.applicant_id = ? ORDER BY o.created_at DESC LIMIT 50", [request.user['id']]).fetchall()
    
    return jsonify({'myTurn': my_turn, 'myPending': mine, 'history': [dict(h) for h in hist_rows]})

@app.route('/api/overtime/<req_id>/approve', methods=['POST'])
@require_auth
def ot_approve(req_id):
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    def on_app(r, db):
        if r['comp_type'] == 'comp':
            db.execute("INSERT INTO comp_time (id, employee_id, earned_date, hours, source, expiry) VALUES (?,?,?,?,'Overtime Comp',?)",
                       [gen_id('CT'), r['applicant_id'], r['date'], r['hours'], '2026-12-31'])
    res, code = _approve(db, req_id, request.user, users, 'ot', 'ot_requests', on_app)
    return jsonify(res), code

# ---------- Comp ----------
@app.route('/api/comp/my', methods=['GET'])
@require_auth
def comp_my():
    db = get_db()
    recs = db.execute('SELECT * FROM comp_time WHERE employee_id = ? ORDER BY earned_date DESC', [request.user['id']]).fetchall()
    total = db.execute('SELECT SUM(hours - used) as s FROM comp_time WHERE employee_id = ? AND status = "available"', [request.user['id']]).fetchone()['s'] or 0
    return jsonify({'records': [dict(r) for r in recs], 'available': total, 'totalEarned': sum(r['hours'] for r in recs), 'totalUsed': sum(r['used'] for r in recs)})

# ---------- Schedule ----------
@app.route('/api/schedule/month/<y>/<m>', methods=['GET'])
@require_auth
def sched_month(y, m):
    db = get_db()
    # Admins see everyone, others see only their department
    if request.user['role'] == 'admin':
        emps = db.execute('SELECT id, name_zh, name_en, dept, dept_en, role FROM users WHERE role != "admin" ORDER BY display_order, dept, name_zh').fetchall()
    else:
        emps = db.execute('SELECT id, name_zh, name_en, dept, dept_en, role FROM users WHERE role != "admin" AND dept = ? ORDER BY display_order, dept, name_zh', [request.user['dept']]).fetchall()
    
    rows = db.execute("SELECT * FROM schedules WHERE strftime('%Y', date) = ? AND CAST(strftime('%m', date) AS INTEGER) = ?", [y, int(m)+1]).fetchall()
    s_map = {}
    for r in rows:
        eid = r['employee_id']
        day = int(r['date'].split('-')[2])
        if eid not in s_map: s_map[eid] = {}
        s_map[eid][day] = r['shift_id']
    import calendar
    dim = calendar.monthrange(int(y), int(m)+1)[1]
    return jsonify({
        'employees': [dict(e) for e in emps],
        'schedule': s_map,
        'daysInMonth': dim,
        'year': int(y),
        'month': int(m)
    })

@app.route('/api/users/reorder', methods=['POST'])
@require_auth
def users_reorder():
    if request.user['role'] != 'admin': return jsonify({'error': 'Forbidden'}), 403
    order = request.json.get('order', []) # List of user IDs
    db = get_db()
    for i, uid in enumerate(order):
        db.execute("UPDATE users SET display_order = ? WHERE id = ?", [i, uid])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/health', methods=['GET'])
def api_health():
    return jsonify({'ok': True, 'time': datetime.now().isoformat()})

@app.route('/api/schedule/<eid>/<dt>', methods=['PUT'])
@require_auth
def sched_update(eid, dt):
    db = get_db()
    # Admin can do anything
    if request.user['role'] == 'admin':
        pass 
    else:
        target = db.execute("SELECT dept FROM users WHERE id = ?", [eid]).fetchone()
        # Managers can edit anyone in their own department
        if request.user['role'] == 'manager' and target and target['dept'] == request.user['dept']:
            pass
        else:
            return jsonify({'error': 'Permission denied'}), 403
    
    sid = (request.json or {}).get('shift_id')
    if sid is None:
        db.execute("DELETE FROM schedules WHERE employee_id = ? AND date = ?", [eid, dt])
    else:
        db.execute("INSERT INTO schedules (employee_id, date, shift_id) VALUES (?,?,?) ON CONFLICT(employee_id, date) DO UPDATE SET shift_id = excluded.shift_id", [eid, dt, sid])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/shifts', methods=['GET'])
@require_auth
def get_shifts():
    db = get_db()
    rows = db.execute('SELECT * FROM shifts').fetchall()
    return jsonify({'shifts': [dict(r) for r in rows]})

# ---------- Admin Shift Management ----------
@app.route('/api/admin/shifts', methods=['POST'])
@require_auth
def admin_add_shift():
    if request.user['role'] != 'admin': return jsonify({'error': 'Forbidden'}), 403
    d = request.json or {}
    sid, label, t, short, color, h = d.get('id'), d.get('label',''), d.get('time',''), d.get('short',''), d.get('color','#888'), d.get('hours',8)
    if not sid or not short: return jsonify({'error': 'Missing ID or Short name'}), 400
    db = get_db()
    try:
        db.execute("INSERT INTO shifts (id, label, time, short, color, hours, is_work) VALUES (?,?,?,?,?,?,?)",
                   [sid, label, t, short, color, h, 1 if t else 0])
        db.commit()
    except Exception as e:
        return jsonify({'error': str(e)}), 400
    return jsonify({'ok': True})

@app.route('/api/admin/shifts/<sid>', methods=['PUT'])
@require_auth
def admin_edit_shift(sid):
    if request.user['role'] != 'admin': return jsonify({'error': 'Forbidden'}), 403
    d = request.json or {}
    label, t, short, color, h = d.get('label',''), d.get('time',''), d.get('short',''), d.get('color','#888'), d.get('hours',8)
    db = get_db()
    db.execute("UPDATE shifts SET label=?, time=?, short=?, color=?, hours=?, is_work=? WHERE id=?",
               [label, t, short, color, h, 1 if t else 0, sid])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/admin/shifts/<sid>', methods=['DELETE'])
@require_auth
def admin_del_shift(sid):
    if request.user['role'] != 'admin': return jsonify({'error': 'Forbidden'}), 403
    db = get_db()
    # Check if shift is in use
    in_use = db.execute("SELECT 1 FROM schedules WHERE shift_id = ? LIMIT 1", [sid]).fetchone()
    if in_use:
        return jsonify({'error': 'Cannot delete shift: It is currently in use in the schedule.'}), 400
    db.execute("DELETE FROM shifts WHERE id=?", [sid])
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/health', methods=['GET'])

@require_auth
def admin_users():
    if request.user['role'] != 'admin': return jsonify({'error': 'Forbidden'}), 403
    db = get_db()
    rows = db.execute('SELECT * FROM users').fetchall()
    res = [dict(r) for r in rows]
    for u in res: u.pop('password_hash', None)
    return jsonify({'users': res})

@app.route('/api/workflows/counts', methods=['GET'])
@require_auth
def workflow_counts():
    db = get_db()
    users = [dict(u) for u in db.execute('SELECT id, role, manager_id, name_zh FROM users').fetchall()]
    
    # helper to count my turn
    def count_my_turn(table, rtype):
        pending = db.execute(f"SELECT * FROM {table} WHERE status = 'pending'").fetchall()
        prec = add_wf_info([dict(r) for r in pending], users, rtype)
        return len([r for r in prec if can_approve(r, request.user, users)])

    counts = {
        'leave': count_my_turn('leave_requests', 'leave'),
        'supplement': count_my_turn('supplement_requests', 'supplement'),
        'ot': count_my_turn('ot_requests', 'ot')
    }
    return jsonify(counts)

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 4443))
    app.run(host='0.0.0.0', port=port, debug=True)
