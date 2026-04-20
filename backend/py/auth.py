import bcrypt

def require_auth(fn):
    """Decorator: requires logged-in user, attaches request.user"""
    from app import get_user_from_session
    from flask import request, jsonify, redirect
    from functools import wraps
    @wraps(fn)
    def decorated(*args, **kwargs):
        user = get_user_from_session()
        if not user:
            return jsonify({'error': 'Not authenticated'}), 401
        request.user = user
        return fn(*args, **kwargs)
    return decorated

def get_approval_chain(applicant_id, users):
    """Server-side approval chain — unforgeable."""
    applicant = next((u for u in users if u['id'] == applicant_id), None)
    if not applicant:
        return []
    if applicant['role'] == 'manager':
        if applicant['id'] == 'H001':
            return ['H033']
        return ['H001', 'H033']
    mgr = applicant.get('manager_id')
    if not mgr:
        return ['H033', 'H001']
    chain = [mgr]
    if mgr != 'H033':
        chain.append('H033')
    if mgr != 'H001' and 'H033' != 'H001':
        chain.append('H001')
    return chain

def can_approve(request_data, current_user, users):
    if request_data['status'] != 'pending':
        return False
    chain = get_approval_chain(request_data['applicant_id'], users)
    step = request_data.get('approval_count', 0)
    if step >= len(chain):
        return False
    return current_user['id'] == chain[step] or current_user['role'] == 'admin'

def setup_auth_routes(app, db):
    from flask import session, request, jsonify

    @app.route('/api/auth/login', methods=['POST'])
    def api_login():
        data = request.json or {}
        username = data.get('username', '').strip()
        password = data.get('password', '')
        if not username or not password:
            return jsonify({'error': 'Missing credentials'}), 400

        row = db.execute('SELECT * FROM users WHERE username = ?', [username]).fetchone()
        if not row:
            return jsonify({'error': 'Invalid credentials'}), 401

        user = dict(row)
        if not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
            return jsonify({'error': 'Invalid credentials'}), 401

        session['user_id'] = user['id']
        user.pop('password_hash', None)
        return jsonify({'user': user})

    @app.route('/api/auth/logout', methods=['POST'])
    def api_logout():
        session.clear()
        return jsonify({'ok': True})

    @app.route('/api/auth/me', methods=['GET'])
    def api_me():
        uid = session.get('user_id')
        if not uid:
            return jsonify({'error': 'Not authenticated'}), 401
        row = db.execute('SELECT id, username, role, name_zh, dept FROM users WHERE id = ?', [uid]).fetchone()
        if not row:
            return jsonify({'error': 'Invalid session'}), 401
        return jsonify({'user': dict(row)})
