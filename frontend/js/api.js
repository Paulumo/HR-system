// API client — all server communication
const API = '/api';

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'same-origin',
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const Auth = {
  login: async (username, password) => api('/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password })
  }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  me: () => api('/auth/me'),
  changePassword: (data) => api('/auth/change-password', {
    method: 'POST', body: JSON.stringify(data)
  })
};

const Attendance = {
  my: () => api('/attendance/my'),
  clockIn: () => api('/attendance/clock-in', { method: 'POST' }),
  clockOut: () => api('/attendance/clock-out', { method: 'POST' }),
  manual: (data) => api('/attendance/manual', { method: 'POST', body: JSON.stringify(data) })
};

const Leaves = {
  my: () => api('/leaves/my'),
  submit: (data) => api('/leaves', { method: 'POST', body: JSON.stringify(data) }),
  pending: () => api('/leaves/pending'),
  approve: (id) => api(`/leaves/${id}/approve`, { method: 'POST' }),
  reject: (id, reason) => api(`/leaves/${id}/reject`, {
    method: 'POST', body: JSON.stringify({ reject_reason: reason })
  })
};

const Supplements = {
  my: () => api('/supplements/my'),
  submit: (data) => api('/supplements', { method: 'POST', body: JSON.stringify(data) }),
  pending: () => api('/supplements/pending'),
  approve: (id) => api(`/supplements/${id}/approve`, { method: 'POST' }),
  reject: (id, reason) => api(`/supplements/${id}/reject`, {
    method: 'POST', body: JSON.stringify({ reject_reason: reason })
  })
};

const OT = {
  my: () => api('/overtime/my'),
  submit: (data) => api('/overtime', { method: 'POST', body: JSON.stringify(data) }),
  pending: () => api('/overtime/pending'),
  approve: (id) => api(`/overtime/${id}/approve`, { method: 'POST' }),
  reject: (id, reason) => api(`/overtime/${id}/reject`, {
    method: 'POST', body: JSON.stringify({ reject_reason: reason })
  })
};

const Comp = {
  my: () => api('/comp/my')
};

const Workflow = {
  counts: () => api('/workflows/counts')
};

const Schedule = {
  month: (y, m) => api(`/schedule/month/${y}/${m}`),
  update: (eid, dt, sid) => api(`/schedule/${eid}/${dt}`, {
    method: 'PUT', body: JSON.stringify({ shift_id: sid })
  }),
  shifts: () => api('/shifts')
};
