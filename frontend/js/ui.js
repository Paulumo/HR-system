// ═══════════════════ i18n ═══════════════════
let LANG='zh';
const T={
  sysName:{zh:'HeliService 人資管理系統',en:'HR Management System'},sysNameSub:{zh:'Human Resources Portal',en:'Human Resources Portal'},
  login:{zh:'員工登入',en:'Employee Login'},accountLabel:{zh:'帳號（員工編號）',en:'Account (Employee ID)'},accountPH:{zh:'請輸入員工編號',en:'Enter employee ID'},passwordLabel:{zh:'密碼',en:'Password'},passwordPH:{zh:'預設密碼 1234',en:'Default: 1234'},loginBtn:{zh:'登 入',en:'Sign In'},loginErr:{zh:'帳號或密碼錯誤',en:'Invalid credentials'},
  nDash:{zh:'總覽',en:'Dashboard'},nAttend:{zh:'出勤',en:'Attendance'},nClock:{zh:'打卡',en:'Clock'},nLeave:{zh:'請假申請',en:'Leave Request'},nSupp:{zh:'補打卡申請',en:'Missed Punch'},nOT:{zh:'加班申請',en:'OT Request'},
  nWorkflow:{zh:'工作流程',en:'Workflow'},nWfLeave:{zh:'假單審核',en:'Leave Approval'},nWfSupp:{zh:'補卡審核',en:'Punch Approval'},nWfOT:{zh:'加班審核',en:'OT Approval'},
  nComp:{zh:'補休管理',en:'Comp Time'},nSchedule:{zh:'班表管理',en:'Schedule'},
  nShiftMgr:{zh:'班別管理',en:'Shifts'},
  pending:{zh:'待審核',en:'Pending'},approved:{zh:'已核准',en:'Approved'},rejected:{zh:'已駁回',en:'Rejected'},approve:{zh:'核准',en:'Approve'},reject:{zh:'駁回',en:'Reject'},cancel:{zh:'取消',en:'Cancel'},save:{zh:'儲存',en:'Save'},submit:{zh:'送出',en:'Submit'},confirm:{zh:'確認',en:'Confirm'},
  ltAnnual:{zh:'特休',en:'Annual'},ltSick:{zh:'病假',en:'Sick'},ltPersonal:{zh:'事假',en:'Personal'},ltComp:{zh:'補休',en:'Comp'},ltMarriage:{zh:'婚假',en:'Marriage'},ltFuneral:{zh:'喪假',en:'Funeral'},
  hello:{zh:'你好，',en:'Hello, '},attendance:{zh:'出勤',en:'Attend.'},otHours:{zh:'加班時數',en:'OT Hours'},compBalance:{zh:'補休餘額',en:'Comp Bal.'},pendingItems:{zh:'待審核',en:'Pending'},
  items:{zh:'件',en:''},noRecord:{zh:'尚無紀錄',en:'No records'},btnClockIn:{zh:'上班打卡',en:'Clock In'},btnClockOut:{zh:'下班打卡',en:'Clock Out'},
  leaveType:{zh:'假別',en:'Type'},startDate:{zh:'開始日期',en:'Start'},endDate:{zh:'結束日期',en:'End'},leaveReason:{zh:'請假事由',en:'Reason'},
  hours:{zh:'時數',en:'Hours'},reason:{zh:'事由',en:'Reason'},date:{zh:'日期',en:'Date'},clockIn:{zh:'上班',en:'In'},clockOut:{zh:'下班',en:'Out'},overtime:{zh:'加班',en:'OT'},status:{zh:'狀態',en:'Status'},
  wfMyTurn:{zh:'待我簽核',en:'My Turn'},wfDone:{zh:'已完成',en:'Done'},noPending:{zh:'無待審核 🎉',en:'All clear 🎉'},employee:{zh:'員工',en:'Employee'},applicant:{zh:'申請人',en:'Applicant'},
  earned:{zh:'取得',en:'Earned'},used:{zh:'已用',en:'Used'},available:{zh:'可用',en:'Available'},totalEarned:{zh:'累計獲得',en:'Earned'},totalUsed:{zh:'已使用',en:'Used'},monthStats:{zh:'本月統計',en:'Stats'},
  editSched:{zh:'編輯班表',en:'Edit'},
  addOT:{zh:'加班申請',en:'Apply OT'},myOTRec:{zh:'我的加班紀錄',en:'My OT Records'},
  otComp:{zh:'換補休',en:'Comp Time'},otPay:{zh:'換薪資',en:'Paid'},
  dow:{zh:["日","一","二","三","四","五","六"],en:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]},
  logout:{zh:'🚪 登出',en:'🚪 Sign Out'},
  account:{zh:'帳號',en:'Account'},identity:{zh:'身份',en:'Role'},
  statusNormal:{zh:'正常',en:'Normal'},statusLate:{zh:'遲到',en:'Late to work'},statusEarly:{zh:'早退',en:'Leave Early'},statusSupp:{zh:'補打卡',en:'Missed Punch'},
  earlyCOWarn:{zh:'尚未到下班時間，確定要早退打卡嗎？',en:'It is not clock-out time yet. Are you sure you want to clock out early?'},
  confirmCO:{zh:'確認下班',en:'Confirm Clock Out'}
};
function t(k){return T[k]?T[k][LANG]||T[k].zh||k:k}
function toggleLang(){LANG=LANG==='zh'?'en':'zh';if(CU)showApp();else renderLogin()}

function esc(s){if(s==null)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmtT(d){return d.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})}
function fmtD(s){if(!s)return'';const d=new Date(s);return`${d.getMonth()+1}/${d.getDate()}`}
function $(id){return document.getElementById(id)}
const TD=new Date(),TDS=TD.toISOString().split("T")[0];
function getDIM(y,m){return new Date(y,m+1,0).getDate()}
function getDowN(y,m,d){return new Date(y,m,d).getDay()}

let CU=null,clockRecs=[],leaveReqs=[],supplRecs=[],otRecs=[],compRecs=[],shifts=[],schedData={},schM,schY,clkTimer=null;
let _wfCounts={leave:0,supplement:0,ot:0}, editMode=false, selShift='day', dirtySched={};

function fmtDate(){return TD.toLocaleDateString(LANG==='zh'?"zh-TW":"en-US",{year:"numeric",month:"long",day:"numeric",weekday:"long"})}
function stat(i,l,v,c){return`<div class="stat-card"><div class="stat-icon" style="background:${c}12">${i}</div><div><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div></div>`}
function badge(s,reason){
  if(s==='approved') return `<span class="badge badge-approved">${t('approved')}</span>`;
  if(s==='rejected') return `<div class="status-rejected"><span class="badge badge-rejected">${t('rejected')}</span>${reason?`<div class="reject-reason">${esc(reason)}</div>`:''}</div>`;
  if(s==='normal') return `<span class="badge badge-approved">${t('statusNormal')}</span>`;
  if(s==='late') return `<span class="badge badge-rejected">${t('statusLate')}</span>`;
  if(s==='early') return `<span class="badge badge-rejected">${t('statusEarly')}</span>`;
  if(s==='supplement') return `<span class="badge badge-pending">${t('statusSupp')}</span>`;
  return `<span class="badge badge-pending">${t('pending')}</span>`;
}

function wfHTML(req){
  const chain = req.approval_chain || [];
  const step = req.approval_count || 0;
  const isRej = req.status==='rejected';
  let h='<div class="wf-steps">';
  h+=`<span class="wf-step done" title="${t('applicant')}">📝</span>`;
  chain.forEach((u,i)=>{
    h+='<span class="wf-arrow">→</span>';
    const title = `${t('approve')}：${u.name}`;
    if(isRej && i === step) h+=`<span class="wf-step fail" title="${title}">✕</span>`;
    else if(i<step) h+=`<span class="wf-step done" title="${title}">✓</span>`;
    else if(i===step && !isRej) h+=`<span class="wf-step current" title="${title}">⏳</span>`;
    else h+=`<span class="wf-step wait" title="${title}">○</span>`;
  });
  h+='</div>';return h;
}

function renderLogin(){
  $("loginPage").innerHTML=`<div class="login-wrap-inner"><div class="login-box"><div class="login-logo"><div class="login-logo-icon"><img src="/frontend/src/hellservice.png" alt="Logo"></div><h1>${t('sysName')}</h1><p>${t('sysNameSub')}</p></div><div class="login-card"><div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="lang-toggle" onclick="toggleLang()">${LANG==='zh'?'EN':'中文'}</button></div><h2>${t('login')}</h2><div id="loginError" class="login-error"><span id="loginErrorMsg"></span></div><div class="form-group"><label class="form-label">${t('accountLabel')}</label><input id="loginUser" class="form-input" placeholder="${t('accountPH')}"></div><div class="form-group"><label class="form-label">${t('passwordLabel')}</label><input id="loginPass" type="password" class="form-input" placeholder="${t('passwordPH')}"></div><button id="loginBtn" class="btn btn-primary btn-full" disabled>${t('loginBtn')}</button><div style="text-align:center;margin-top:16px"><a href="#" onclick="openChangePasswordModal()" style="font-size:14px;color:var(--blue);text-decoration:none">${LANG==='zh'?'變更密碼':'Change Password'}</a></div></div><p class="login-footer">© 2026 HR System v3.0</p></div></div>`;
  $("loginUser").addEventListener("input",chkL);$("loginPass").addEventListener("input",chkL);
  $("loginUser").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin()});$("loginPass").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin()});
  $("loginBtn").addEventListener("click",doLogin);
}

function openChangePasswordModal() {
  const h = `<div class="modal-overlay" id="changePassModal">
    <div class="modal-content" style="max-width:400px">
      <h3 style="font-size:20px;font-weight:800;margin-bottom:20px">🔐 ${LANG==='zh'?'變更密碼':'Change Password'}</h3>
      <div class="form-group">
        <label class="form-label">${t('accountLabel')}</label>
        <input id="cpUser" class="form-input" placeholder="${t('accountPH')}">
      </div>
      <div class="form-group">
        <label class="form-label">${LANG==='zh'?'目前密碼':'Current Password'}</label>
        <input id="cpOld" type="password" class="form-input" placeholder="Current Password">
      </div>
      <div class="form-group">
        <label class="form-label">${LANG==='zh'?'新密碼':'New Password'}</label>
        <input id="cpNew" type="password" class="form-input" placeholder="New Password">
      </div>
      <div class="mt-6" style="display:flex;gap:12px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="$('changePassModal').remove()">${t('cancel')}</button>
        <button class="btn btn-primary" onclick="submitChangePassword()">${t('confirm')}</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', h);
}

async function submitChangePassword() {
  const u = $("cpUser").value.trim();
  const oldP = $("cpOld").value;
  const newP = $("cpNew").value;
  
  if (!u || !oldP || !newP) return alert("Please fill all fields");
  if (newP.length < 4) return alert("New password must be at least 4 characters");

  try {
    await Auth.changePassword({ username: u, old_password: oldP, new_password: newP });
    alert(LANG === 'zh' ? "密碼已成功變更" : "Password changed successfully");
    $("changePassModal").remove();
  } catch (e) {
    alert(e.message);
  }
}
window.openChangePasswordModal = openChangePasswordModal;
window.submitChangePassword = submitChangePassword;
function chkL(){$("loginBtn").disabled=!$("loginUser").value||!$("loginPass").value}
async function doLogin(){
  const u=$("loginUser").value.trim(),p=$("loginPass").value;
  try{
    const data=await Auth.login(u,p);CU=data.user;
    await loadAll(); showApp();
  }catch(e){$("loginError").classList.add("show");$("loginErrorMsg").textContent=e.message||t('loginErr')}
}
async function loadAll(){
  const [a,l,s,o,c,sh,wf,u]=await Promise.all([Attendance.my(),Leaves.my(),Supplements.my(),OT.my(),Comp.my(),Schedule.shifts(),Workflow.counts(),Auth.me()]);
  clockRecs=a.records||[];leaveReqs=l.requests||[];supplRecs=s.records||[];otRecs=o.records||[];compRecs=c.records||[];shifts=sh.shifts||[];_wfCounts=wf;CU=u.user;
}
async function doLogout(){try{await Auth.logout();CU=null;location.reload();}catch(e){alert(e.message)}}

function showApp(){
  $("loginPage").style.display="none";$("app").classList.add("active");
  $("app").innerHTML=`
  <div class="topbar"><div class="topbar-left"><button class="hamburger" onclick="$('sidebar').classList.toggle('collapsed')">☰</button><div class="topbar-logo"><img src="/frontend/src/hellservice.png" alt="Logo"></div><div class="topbar-title"><h3>${t('sysName')}</h3><small>${t('sysNameSub')}</small></div></div>
  <div class="topbar-right">
    <button class="lang-toggle" onclick="toggleLang()">${LANG==='zh'?'EN':'中文'}</button>
    <div style="width:1px;height:24px;background:var(--gray-200);margin:0 4px"></div>
    <div class="user-menu-btn" onclick="$('userDD').classList.toggle('show')">
      <div class="user-menu-info">
        <div class="name">${esc(CU.name_zh)}</div>
        <div class="sub">${esc(CU.dept)}</div>
      </div>
      <span style="color:var(--gray-400);font-size:10px">▼</span>
      <div id="userDD" class="user-dropdown">
        <div class="user-dropdown-info">${t('account')}：<span class="mono">${esc(CU.username)}</span></div>
        <div class="user-dropdown-info">${t('identity')}：${tRole(CU.role)}</div>
        <button class="logout-btn" onclick="doLogout()">${t('logout')}</button>
      </div>
    </div>
  </div>
  </div>
  <div class="layout"><div id="sidebar" class="sidebar"><div class="sidebar-inner"><div id="navBtns"></div></div></div><div class="main"><div class="page-title" id="pgTitle"></div>
  <div id="pg-dashboard" class="page"></div><div id="pg-clock" class="page"></div><div id="pg-leave" class="page"></div><div id="pg-ot" class="page"></div><div id="pg-wf-leave" class="page"></div><div id="pg-wf-supp" class="page"></div><div id="pg-wf-ot" class="page"></div><div id="pg-comp" class="page"></div><div id="pg-schedule" class="page"></div>
  </div></div>`;
  document.addEventListener("click",e=>{if(!e.target.closest(".user-menu-btn")){const dd=$("userDD");if(dd)dd.classList.remove("show")}});
  buildNav(); nav("dashboard"); if(clkTimer)clearInterval(clkTimer); clkTimer=setInterval(tick,1000); tick();
}
function tRole(r){return r==='admin'?t('rAdmin'):r==='manager'?t('rManager'):t('rEmployee')}

function buildNav(){
  const plv=_wfCounts.leave, psp=_wfCounts.supplement, pot=_wfCounts.ot, ptot=plv+psp+pot;
  let h='';
  h+=`<button class="nav-btn" data-t="dashboard" onclick="nav('dashboard')"><span class="icon">📊</span>${t('nDash')}</button>`;
  h+=`<button class="nav-group-btn open" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open')"><span class="icon">⏱</span>${t('nAttend')}<span class="arrow">▼</span></button>`;
  h+=`<div class="nav-sub open">`;
  h+=`<button class="nav-btn" data-t="clock" onclick="nav('clock')"><span class="icon">🕒</span>${t('nClock')}</button>`;
  h+=`<button class="nav-btn" data-t="leave" onclick="nav('leave')"><span class="icon">📋</span>${t('nLeave')}</button>`;
  h+=`<button class="nav-btn" data-t="ot" onclick="nav('ot')"><span class="icon">⏰</span>${t('nOT')}</button>`;
  h+=`<button class="nav-btn" data-t="comp" onclick="nav('comp')"><span class="icon">🕐</span>${t('nComp')}</button>`;
  h+=`<button class="nav-btn" data-t="schedule" onclick="nav('schedule')"><span class="icon">📅</span>${t('nSchedule')}</button>`;
  h+=`</div>`;
  h+=`<button class="nav-group-btn open" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open')"><span class="icon">📑</span>${t('nWorkflow')}${ptot>0?`<span class="nav-badge" style="margin-left:auto;background:var(--red);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px">${ptot}</span>`:''}<span class="arrow">▼</span></button>`;
  h+=`<div class="nav-sub open">`;
  h+=`<button class="nav-btn" data-t="wf-leave" onclick="nav('wf-leave')"><span class="icon">✅</span>${t('nWfLeave')}${plv?`<span class="nav-badge" style="margin-left:auto;background:var(--red);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px">${plv}</span>`:''}</button>`;
  h+=`<button class="nav-btn" data-t="wf-supp" onclick="nav('wf-supp')"><span class="icon">🔍</span>${t('nWfSupp')}${psp?`<span class="nav-badge" style="margin-left:auto;background:var(--red);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px">${psp}</span>`:''}</button>`;
  h+=`<button class="nav-btn" data-t="wf-ot" onclick="nav('wf-ot')"><span class="icon">💵</span>${t('nWfOT')}${pot?`<span class="nav-badge" style="margin-left:auto;background:var(--red);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px">${pot}</span>`:''}</button>`;
  h+=`</div>`;
  $("navBtns").innerHTML=h;
}

const PAGES={dashboard:'rDash',clock:'rClock',leave:'rLeave',ot:'rOt',"wf-leave":'rWfLv',"wf-supp":'rWfSp',"wf-ot":'rWfOt',comp:'rComp',schedule:'rSched'};
const PT=()=>({dashboard:`📊 ${t('nDash')}`,clock:`🕒 ${t('nClock')}`,leave:`📋 ${t('nLeave')}`,ot:`⏰ ${t('nOT')}`,"wf-leave":`✅ ${t('nWfLeave')}`,"wf-supp":`🔍 ${t('nWfSupp')}`,"wf-ot":`💵 ${t('nWfOT')}`,comp:`🕐 ${t('nComp')}`,schedule:`📅 ${t('nSchedule')}`});
async function nav(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  const el=$(`pg-${id}`);if(el)el.classList.add("active");
  const btn=document.querySelector(`.nav-btn[data-t="${id}"]`);if(btn)btn.classList.add("active");
  
  const titleStr = PT()[id]||"";
  if(id === 'clock') {
    const icon = titleStr.substring(0, 2);
    const text = titleStr.substring(2);
    $("pgTitle").innerHTML = `<span onclick="openDevDashboard()">${icon}</span>${text}`;
  } else {
    $("pgTitle").textContent = titleStr;
  }
  
  const fn=PAGES[id];if(fn&&window[fn])await window[fn](id);
  const wf = await Workflow.counts(); _wfCounts = wf; buildNav();
}
async function refresh(){const a=document.querySelector(".page.active");if(a)nav(a.id.replace("pg-",""))}
function tick(){document.querySelectorAll(".js-time").forEach(e=>e.textContent=fmtT(new Date()));document.querySelectorAll(".js-date").forEach(e=>e.textContent=fmtDate())}

function rDash(){
  const totOt=CU.ot_hours_total_month||0;
  const alH=CU.annual_leave_balance_hours||0;
  const plv=_wfCounts.leave + _wfCounts.supplement + _wfCounts.ot;
  const tr=clockRecs.find(r=>r.date===TDS);
  const ciD=tr&&tr.clock_in?'disabled':'';
  const coD=!tr||!tr.clock_in||tr.clock_out?'disabled':'';
  const ts=CU.today_shift;
  const shiftInfo=ts?`${esc(ts.label)} ${ts.time?`(${ts.time})`:''}` : t('noRecord');

  $("pg-dashboard").innerHTML=`
    <!-- Part 1: Welcome & Shift -->
    <div class="dash-welcome">
      <div class="welcome-main">
        <div class="date js-date"></div>
        <h2>${t('hello')}${esc(CU.name_zh)}</h2>
        <div class="today-shift"><span>📅</span> ${t('nSchedule')}: ${shiftInfo}</div>
      </div>
      <div class="welcome-time">
        <div class="greeting-time js-time"></div>
      </div>
    </div>

    <!-- Part 2: Summary Data -->
    <div class="stats-grid stats-grid-4">
      ${stat("📅",t('attendance'),clockRecs.length+"d","#2563EB")}
      ${stat("⏰",t('otHours'),totOt.toFixed(1)+"h","#F59E0B")}
      ${stat("🏝️",t('ltAnnual'),(alH/8).toFixed(1)+"d","#10B981")}
      ${stat("📋",t('pendingItems'),plv+t('items'),"#8B5CF6")}
    </div>

    <!-- Part 3 & 4: Quick Punch & Recent Leaves -->
    <div class="dash-row-split">
      <div class="card dash-quick-punch">
        <div class="card-header">⚡ ${t('nClock')}</div>
        <div class="card-body">
          <div class="punch-btns-vertical">
            <button class="btn btn-green btn-punch-large" ${ciD} onclick="doQuickCI()">
              <div class="punch-icon">🟢</div>
              <div class="punch-text">
                <div class="punch-title">${t('btnClockIn')}</div>
                <div class="punch-sub">${tr&&tr.clock_in?tr.clock_in:'--:--'}</div>
              </div>
            </button>
            <button class="btn btn-red btn-punch-large" ${coD} onclick="doQuickCO()">
              <div class="punch-icon">🔴</div>
              <div class="punch-text">
                <div class="punch-title">${t('btnClockOut')}</div>
                <div class="punch-sub">${tr&&tr.clock_out?tr.clock_out:'--:--'}</div>
              </div>
            </button>
          </div>
        </div>
      </div>
      <div class="card dash-recent-leaves">
        <div class="card-header">📝 ${t('nLeave')}</div>
        <div class="card-body">
          <div class="mini-list">
            ${leaveReqs.slice(0,3).length===0?`<div class="card-empty">${t('noRecord')}</div>`:leaveReqs.slice(0,3).map(r=>`
              <div class="mini-item">
                <div class="mini-info">
                  <div class="mini-title">${esc(r.leave_type)}</div>
                  <div class="mini-sub">${fmtD(r.start_date)}</div>
                </div>
                <div class="mini-status">${badge(r.status,r.reject_reason)}</div>
              </div>
            `).join("")}
          </div>
          <button class="btn btn-sm btn-outline btn-full mt-4" onclick="nav('leave')">${t('confirm')}</button>
        </div>
      </div>
    </div>

    <!-- Part 5: Month Records -->
    <div class="card">
      <div class="card-header">📅 ${t('attendance')} (${new Date().getMonth()+1}${t('items')})</div>
      <div class="overflow-auto">
        <table class="dash-table">
          <thead>
            <tr><th>${t('date')}</th><th>${t('clockIn')}</th><th>${t('clockOut')}</th><th>${t('overtime')}</th><th>${t('status')}</th></tr>
          </thead>
          <tbody>
            ${clockRecs.length===0?`<tr><td colspan="5" class="card-empty">${t('noRecord')}</td></tr>`:clockRecs.map(r=>`
              <tr>
                <td>${r.date}</td>
                <td class="mono">${r.clock_in||"—"}</td>
                <td class="mono">${r.clock_out||"—"}</td>
                <td class="mono">${r.overtime||"-"}</td>
                <td>${badge(r.status, r.reject_reason)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  tick();
}

async function doQuickCI(){ try{await Attendance.clockIn();await loadAll();refresh()}catch(e){alert(e.message)} }
async function confirmClockOut(callback) {
  const ts = CU.today_shift;
  const now = new Date();
  let isEarly = false;

  if (ts && ts.time && ts.time.includes('-')) {
    try {
      const endStr = ts.time.split('-')[1].trim();
      const [eh, em] = endStr.split(':').map(Number);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const schedMin = eh * 60 + em;
      if (nowMin < schedMin - 5) isEarly = true;
    } catch(e) { console.error("Early check error", e); }
  }

  if (isEarly) {
    const h = `<div class="modal-overlay" id="earlyCOModal">
      <div class="modal-content" style="max-width:400px; text-align:center;">
        <div style="font-size:50px; margin-bottom:16px;">⚠️</div>
        <h3 style="justify-content:center; margin-bottom:12px;">${t('confirmCO')}</h3>
        <p style="color:var(--gray-500); line-height:1.5; margin-bottom:24px;">${t('earlyCOWarn')}</p>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button class="btn btn-outline" style="flex:1" onclick="$('earlyCOModal').remove()">${t('cancel')}</button>
          <button class="btn btn-red" style="flex:1" id="confirmCOBtn">${t('confirm')}</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', h);
    $('confirmCOBtn').onclick = async () => {
      $('earlyCOModal').remove();
      try {
        await callback();
        await loadAll();
        refresh();
      } catch(e) { alert(e.message); }
    };
  } else {
    try {
      await callback();
      await loadAll();
      refresh();
    } catch(e) { alert(e.message); }
  }
}

async function doQuickCO(){ confirmClockOut(() => Attendance.clockOut()); }

function rClock(){
  const tr=clockRecs.find(r=>r.date===TDS);
  const ciD=tr&&tr.clock_in?'disabled':'';
  const coD=!tr||!tr.clock_in||tr.clock_out?'disabled':'';
  $("pg-clock").innerHTML=`<div class="clock-hero"><div class="clock-time js-time"></div><div class="js-date" style="font-size:15px;color:var(--gray-500);margin-top:8px"></div><div class="clock-buttons" onclick="event.stopPropagation()"><button class="btn btn-green" style="padding:14px 40px;font-size:16px" onclick="doCI()" ${ciD}>${t('btnClockIn')}</button><button class="btn btn-red" style="padding:14px 40px;font-size:16px" onclick="doCO()" ${coD}>${t('btnClockOut')}</button></div></div><div class="card"><div class="card-header">${t('attendance')}</div><div class="overflow-auto"><table><thead><tr><th>${t('date')}</th><th>${t('clockIn')}</th><th>${t('clockOut')}</th><th>${t('overtime')}</th><th>${t('status')}</th></tr></thead><tbody>${clockRecs.length===0?`<tr><td colspan="5" class="card-empty">${t('noRecord')}</td></tr>`:clockRecs.map(r=>`<tr><td>${r.date}</td><td class="mono">${r.clock_in||"—"}</td><td class="mono">${r.clock_out||"—"}</td><td class="mono">${r.overtime||"-"}</td><td>${badge(r.status, r.reject_reason)}</td></tr>`).join("")}</tbody></table></div></div>`;
  tick();
}

function openManualPunch(){
  const now = new Date();
  const curTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  let h=`<div class="modal-overlay" id="manualPunchModal"><div class="modal-content" style="max-width:400px"><h3>🕒 ${t('UTC+8 CALIBRATE')||'UTC+8 CALIBRATE'}</h3>
    <div class="form-grid">
      <div class="form-full"><label class="form-label">${t('date')}</label><input id="mpDate" type="date" class="form-input" value="${TDS}"></div>
      <div class="form-full"><label class="form-label">${t('time')||'Time'}</label><input id="mpTime" type="time" class="form-input" value="${curTime}"></div>
      <div class="form-full"><label class="form-label">${t('type')||'Type'}</label>
        <div style="display:flex;gap:12px">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="mpType" value="in" checked> A</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="mpType" value="out"> B</label>
        </div>
      </div>
    </div>
    <div class="mt-6" style="display:flex;gap:12px;justify-content:flex-end">
      <button class="btn btn-outline" onclick="$('manualPunchModal').remove()">${t('cancel')}</button>
      <button class="btn btn-primary" onclick="submitManualPunch()">${t('submit')}</button>
    </div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend',h);
}

async function submitManualPunch(){
  const date = $('mpDate').value;
  const time = $('mpTime').value;
  const type = document.querySelector('input[name="mpType"]:checked').value;
  if(!date || !time) return alert("Please fill in all fields");
  
  try {
    const data = {
      date,
      clock_in: type === 'in' ? time : undefined,
      clock_out: type === 'out' ? time : undefined
    };
    await Attendance.manual(data);
    $('manualPunchModal').remove();
    alert("Record updated successfully");
    await loadAll(); refresh();
  } catch(e){ alert(e.message) }
}
function openDevDashboard() {
  const h = `<div class="modal-overlay" id="devDashboardModal">
    <div class="modal-content" style="max-width:300px">
      <h3>DEV DASHBOARD</h3>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input id="devPass" type="password" class="form-input" placeholder="Enter password">
      </div>
      <div class="mt-6" style="display:flex;gap:12px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="$('devDashboardModal').remove()">${t('cancel')}</button>
        <button class="btn btn-primary" onclick="checkDevPass()">${t('confirm')}</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', h);
  $("devPass").addEventListener("keydown",e=>{if(e.key==="Enter")checkDevPass()});
  $("devPass").focus();
}

function checkDevPass() {
  const p = $("devPass").value;
  if (p === 'NOPASSWORD') {
    $("devDashboardModal").remove();
    openManualPunch();
  } else {
    alert("Incorrect Password");
  }
}
window.openDevDashboard = openDevDashboard; window.checkDevPass = checkDevPass;
window.openManualPunch = openManualPunch; window.submitManualPunch = submitManualPunch;
async function doCI(){try{await Attendance.clockIn();await loadAll();refresh()}catch(e){alert(e.message)}}
async function doCO(){ confirmClockOut(() => Attendance.clockOut()); }

async function rLeave(){
  $("pg-leave").innerHTML=`<div class="card"><div class="card-body"><h3 style="font-size:16px;font-weight:700;margin-bottom:20px">📝 ${t('addLeave')}</h3><div class="form-grid"><div><label class="form-label">${t('leaveType')}</label><select id="lvType" class="form-input">${['annual','sick','personal','comp','marriage','funeral'].map(lt=>`<option value="${lt}">${t('lt'+lt.charAt(0).toUpperCase()+lt.slice(1))||lt}</option>`).join("")}</select></div><div><label class="form-label">${t('hours')}</label><input id="lvH" type="number" value="8" class="form-input"></div><div><label class="form-label">${t('startDate')}</label><input id="lvSt" type="date" class="form-input"></div><div><label class="form-label">${t('endDate')}</label><input id="lvEn" type="date" class="form-input"></div><div class="form-full"><label class="form-label">${t('reason')}</label><textarea id="lvR" class="form-input" rows="2" placeholder="${t('leaveReason')}"></textarea></div></div><button class="btn btn-primary mt-4" onclick="subLv()">${t('submit')}</button></div></div><div class="card"><div class="card-header">${t('myLeaveRec')}</div><div class="overflow-auto"><table><thead><tr><th>${t('leaveType')}</th><th>${t('date')}</th><th>${t('hours')}</th><th>${t('status')}</th><th>${t('wfTitle')}</th></tr></thead><tbody>${leaveReqs.length===0?`<tr><td colspan="5" class="card-empty">${t('noRecord')}</td></tr>`:leaveReqs.map(r=>`<tr><td>${esc(r.leave_type)}</td><td>${fmtD(r.start_date)}${r.end_date!==r.start_date?" ~ "+fmtD(r.end_date):""}</td><td class="mono">${r.hours}h</td><td>${badge(r.status, r.reject_reason)}</td><td>${wfHTML(r)}</td></tr>`).join("")}</tbody></table></div></div>`;
}
async function subLv(){const tp=$("lvType")?.value,h=+$("lvH")?.value,s=$("lvSt")?.value,e=$("lvEn")?.value,r=$("lvR")?.value;if(!s||!r)return alert('Missing fields');try{await Leaves.submit({leave_type:tp,start_date:s,end_date:e||s,hours:h,reason:r});await loadAll();nav("leave")}catch(e){alert(e.message)}}

async function rOt(){
  $("pg-ot").innerHTML=`<div class="card"><div class="card-body"><h3 style="font-size:16px;font-weight:700;margin-bottom:20px">⏰ ${t('addOT')}</h3><div class="form-grid"><div><label class="form-label">${t('date')}</label><input id="otDt" type="date" class="form-input"></div><div><label class="form-label">${t('hours')}</label><input id="otH" type="number" value="2" class="form-input"></div><div><label class="form-label">${t('leaveType')}</label><select id="otTp" class="form-input"><option value="comp">${t('otComp')}</option><option value="pay">${t('otPay')}</option></select></div><div class="form-full"><label class="form-label">${t('reason')}</label><textarea id="otR" class="form-input" rows="2" placeholder="${t('reason')}"></textarea></div></div><button class="btn btn-primary mt-4" onclick="subOt()">${t('submit')}</button></div></div><div class="card"><div class="card-header">${t('myOTRec')}</div><div class="overflow-auto"><table><thead><tr><th>${t('date')}</th><th>${t('hours')}</th><th>${t('leaveType')}</th><th>${t('status')}</th><th>${t('wfTitle')}</th></tr></thead><tbody>${otRecs.length===0?`<tr><td colspan="5" class="card-empty">${t('noRecord')}</td></tr>`:otRecs.map(r=>`<tr><td>${r.date}</td><td class="mono">${r.hours}h</td><td>${r.comp_type==='comp'?t('otComp'):t('otPay')}</td><td>${badge(r.status, r.reject_reason)}</td><td>${wfHTML(r)}</td></tr>`).join("")}</tbody></table></div></div>`;
}
async function subOt(){const d=$("otDt")?.value,h=+$("otH")?.value,tp=$("otTp")?.value,r=$("otR")?.value;if(!d||!r)return alert('Missing fields');try{await OT.submit({date:d,hours:h,comp_type:tp,reason:r});await loadAll();nav("ot")}catch(e){alert(e.message)}}

function renderApproval(pgId,recs,pfx){
  let h='';
  if(recs.myTurn&&recs.myTurn.length){
    h+=`<div class="card"><div class="card-header">⏳ ${t('wfMyTurn')} <span class="nav-badge" style="margin-left:auto;background:var(--red);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px">${recs.myTurn.length}</span></div>`;
    recs.myTurn.forEach(r=>{
      const det=`${esc(r.leave_type||r.type||'')} ${fmtD(r.start_date||r.date)} ${r.hours||''}h`;
      h+=`<div class="review-item"><div class="review-info"><h4>${esc(r.name_zh||r.applicant_id||'')}</h4><div class="detail">${det}</div><div style="font-size:12px;color:var(--gray-400)">${esc(r.reason||'')}</div>${wfHTML(r)}</div><div class="review-actions" id="${pfx}${r.id}"><button class="btn btn-sm" style="background:var(--green-light);color:var(--green-dark)" onclick="appItem('${pfx}','${r.id}')">✓ ${t('approve')}</button><button class="btn btn-sm" style="background:var(--red-light);color:var(--red-dark)" onclick="showReject('${pfx}','${r.id}')">✕ ${t('reject')}</button></div></div>`;
    });h+=`</div>`;
  }
  if(recs.myPending&&recs.myPending.length){
    h+=`<div class="card"><div class="card-header">📝 ${t('pendingItems')}</div>`;
    recs.myPending.forEach(r=>{
      const det=`${esc(r.leave_type||r.type||'')} ${fmtD(r.start_date||r.date)} ${r.hours||''}h`;
      h+=`<div class="review-item"><div class="review-info"><h4>${esc(r.name_zh||r.applicant_id||'')}</h4><div class="detail">${det}</div>${wfHTML(r)}</div><div>${badge(r.status)}</div></div>`;
    });h+=`</div>`;
  }
  if(recs.history&&recs.history.length){
    h+=`<div class="card"><div class="card-header">${t('wfDone')}</div>`;
    recs.history.slice(0,20).forEach(r=>{h+=`<div class="review-item" style="padding:12px 20px"><div class="review-info"><h4 style="font-size:13px">${esc(r.name_zh||r.applicant_id||'')} · ${esc(r.leave_type||r.type||'')} ${fmtD(r.start_date||r.date)}</h4>${wfHTML(r)}</div><div>${badge(r.status)}</div></div>`});
    h+=`</div>`;
  }
  if(!recs.myTurn?.length&&!recs.history?.length&&!recs.myPending?.length)h+=`<div class="card"><div class="card-empty">${t('noPending')}</div></div>`;
  $(`pg-${pgId}`).innerHTML=h;
}
function showReject(pfx,id){const el=$(`${pfx}${id}`);if(!el)return;el.innerHTML=`<input type="text" id="rj${pfx}${id}" placeholder="${t('reason')}" style="padding:4px 8px;border-radius:4px;border:1px solid #ccc;font-size:12px;margin-right:6px"><button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="doReject('${pfx}','${id}')">${t('confirm')}</button><button class="btn btn-sm btn-outline" onclick="refresh()">✕</button>`;}
async function appItem(pfx,id){const fn={wflp:Leaves.approve,wfsp:Supplements.approve,wfot:OT.approve}[pfx];if(!fn)return;try{await fn(id);await loadAll();refresh()}catch(e){alert(e.message)}}
async function doReject(pfx,id){const r=$(`rj${pfx}${id}`)?.value;if(!r)return alert(t('reason')+' required');const fn={wflp:Leaves.reject,wfsp:Supplements.reject,wfot:OT.reject}[pfx];if(!fn)return;try{await fn(id,r);await loadAll();refresh()}catch(e){alert(e.message)}}

async function rWfLv(){const d=await Leaves.pending();renderApproval('wf-leave',d,'wflp')}
async function rWfSp(){const d=await Supplements.pending();renderApproval('wf-supp',d,'wfsp')}
async function rWfOt(){const d=await OT.pending();renderApproval('wf-ot',d,'wfot')}

function rComp(){const e=compRecs.reduce((s,r)=>s+(r.hours||0),0),u=compRecs.reduce((s,r)=>s+(r.used||0),0);$("pg-comp").innerHTML=`<div class="stats-grid stats-grid-3">${stat("📥",t('totalEarned'),e+"h","#2563EB")}${stat("📤",t('totalUsed'),u+"h","#F59E0B")}${stat("💎",t('available'),(e-u)+"h","#10B981")}</div><div class="card"><div class="card-header">${t('compRec')}</div>${compRecs.length===0?`<div class="card-empty">${t('noRecord')}</div>`:`<div class="overflow-auto"><table><thead><tr><th>${t('date')}</th><th>${t('earned')}</th><th>${t('used')}</th><th>${t('available')}</th></tr></thead><tbody>${compRecs.map(r=>`<tr><td>${r.earned_date||'—'}</td><td class="mono">${r.hours}h</td><td class="mono">${r.used}h</td><td class="mono">${r.hours-r.used}h</td></tr>`).join("")}</tbody></table></div>`}</div>`;}

async function rSched(){try{const y=schY||TD.getFullYear(),m=schM??TD.getMonth();const d=await Schedule.month(y,m);shifts=d.shifts||shifts;schedData=d.schedule||{};schY=d.year;schM=d.month;const dim=d.daysInMonth||getDIM(schY,schM);const emps=d.employees||[];
let hd=`<tr><th class="sticky" style="min-width:110px">${t('employee')}</th>`;
const dows=T.dow[LANG]||T.dow.zh;
for(let i=0;i<dim;i++){
  const dn=getDowN(schY,schM,i+1);
  const dow=dows[dn]||'';
  const we=dn===0||dn===6;
  const isToday=schY===TD.getFullYear()&&schM===TD.getMonth()&&(i+1)===TD.getDate();
  hd+=`<th style="text-align:center;padding:6px 2px;min-width:44px;color:${we?"var(--red)":"var(--gray-500)"};${isToday?"background:var(--blue-light);border-radius:8px 8px 0 0":""}"><div class="mono" style="font-size:13px">${i+1}</div><div style="font-size:10px">${dow}</div></th>`}hd+="</tr>";
let bd="",lastDept="";
const isAdm = CU.role==='admin';
emps.forEach(emp=>{
  if(emp.dept!==lastDept){
    const dStr = LANG==='zh' ? `${esc(emp.dept)} (${esc(emp.dept_en||emp.dept)})` : esc(emp.dept_en||emp.dept);
    bd+=`<tr class="dept-sep"><td class="sticky">${dStr}</td><td colspan="${dim}"></td></tr>`;
    lastDept=emp.dept;
  }
  const nStr = LANG==='zh' ? `${esc(emp.name_zh)} (${esc(emp.name_en||emp.id)})` : esc(emp.name_en||emp.id);
  const isMe = emp.id === CU.id;
  bd+=`<tr class="${isMe?'highlight-me':''}" ${isAdm?`draggable="true" ondragstart="rowDrag(event)" ondragover="rowOver(event)" ondrop="rowDrop(event)"`:""} data-uid="${emp.id}">
    <td class="sticky" style="font-weight:600;font-size:12px">${isAdm?"<span style='cursor:grab;margin-right:4px'>≡</span>":""}${nStr}</td>`;for(let i=0;i<dim;i++){
  const d=i+1;
  const s=(dirtySched[emp.id]||{})[d] || (schedData[emp.id]||{})[d];
  const sh=shifts.find(x=>x.id===s)||(s?{color:'#999',short:s}:{color:'#9ca3af',short:'無'});
  const isToday=schY===TD.getFullYear()&&schM===TD.getMonth()&&d===TD.getDate();
  const canEditRow = CU.role==='admin' || (CU.role==='manager' && emp.dept===CU.dept);
  bd+=`<td style="padding:2px;text-align:center;${isToday?"background:var(--blue-light)22":""}"><div class="sched-cell ${editMode && canEditRow?"editable":""}" style="background:${sh.color}22;color:${sh.color}" ${editMode && canEditRow?`onclick="setSh('${emp.id}',${d})"`:""}>${sh.short}</div></td>`}bd+="</tr>";});
let toolsH="";if(editMode){shifts.forEach(st=>{toolsH+=`<button class="shift-btn ${selShift===st.id?"active":""}" style="color:${st.color};${selShift===st.id?`border-color:${st.color};border-width:2px;background:${st.color}18`:""}" onclick="selSh('${st.id}')">${st.short||st.id}</button>`});
toolsH+=`<button class="shift-btn ${selShift===null?"active":""}" style="color:#9ca3af;${selShift===null?`border-color:#9ca3af;border-width:2px;background:#9ca3af18`:""}" onclick="selSh(null)">無</button>`;}
if(CU.role==='admin'||CU.role==='manager'){
  if(editMode){
    toolsH+=`<button class="btn btn-sm btn-primary" onclick="saveSched()">${t('save')}</button>`;
    toolsH+=`<button class="btn btn-sm btn-red" onclick="togEdit()">${t('cancel')}</button>`;
  } else {
    if(CU.role==='admin') toolsH+=`<button class="btn btn-sm btn-outline" onclick="showShiftMgr()" style="margin-right:8px">⚙️ ${t('nShiftMgr')||'班別管理'}</button>`;
    toolsH+=`<button class="btn btn-sm btn-primary" onclick="togEdit()">${t('editSched')}</button>`;
  }
}
const mTitle=LANG==='zh'?`${schY}年${schM+1}月`:new Date(schY,schM).toLocaleDateString('en-US',{year:'numeric',month:'long'});
$("pg-schedule").innerHTML=`<div class="sched-header"><div class="sched-nav"><button onclick="schP()">◀</button><span>${mTitle}</span><button onclick="schN()">▶</button></div><div class="sched-tools">${toolsH}</div></div><div class="card sched-card"><div class="sched-table"><table><thead>${hd}</thead><tbody>${bd}</tbody></table></div></div><div class="card"><div class="card-body"><div style="font-weight:700;font-size:14px;margin-bottom:12px">${t('monthStats')}</div><div class="legend">${shifts.map(sh=>`<span><span class="legend-dot" style="background:${sh.color}"></span>${esc(sh.label)}${sh.time?' ('+sh.time+')':''}</span>`).join("")}</div></div></div>`;}catch(e){console.error(e)}}

function showShiftMgr(){
  let h=`<div class="modal-overlay" id="shiftModal"><div class="modal-content" style="max-width:750px"><h3>⚙️ ${t('nShiftMgr')||'班別管理'}</h3><div class="overflow-auto" style="max-height:450px"><table class="dash-table"><thead><tr><th>ID</th><th>Label</th><th>Time</th><th>Short</th><th>Color</th><th>Actions</th></tr></thead><tbody>`;
  shifts.forEach(s=>{
    h+=`<tr><td class="mono" style="font-weight:700">${esc(s.id)}</td><td>${esc(s.label)}</td><td class="mono">${esc(s.time)}</td><td style="text-align:center"><div class="sched-cell" style="background:${s.color}22;color:${s.color};margin:0">${esc(s.short)}</div></td><td><div style="display:flex;align-items:center;gap:8px"><span class="legend-dot" style="background:${s.color}"></span><span class="mono">${s.color}</span></div></td><td><div style="display:flex;gap:4px"><button class="btn btn-sm btn-outline" onclick="openShiftForm('${s.id}')">${t('edit')||'Edit'}</button><button class="btn btn-sm btn-red" style="padding:6px 10px" onclick="delShift('${s.id}')">🗑️</button></div></td></tr>`;
  });
  h+=`</tbody></table></div><div class="mt-4" style="display:flex;justify-content:space-between"><div><button class="btn btn-primary" onclick="openShiftForm()">+ ${t('add')||'Add Shift'}</button></div><button class="btn btn-outline" onclick="$('shiftModal').remove()">${t('close')||'Close'}</button></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend',h);
}

function openShiftForm(sid=null){
  const s = sid ? shifts.find(x=>x.id===sid) : {id:'',label:'',time:'',short:'',color:'#2563EB',hours:8};
  const isEdit = !!sid;
  let h=`<div class="modal-overlay" id="shiftFormModal"><div class="modal-content" style="max-width:480px"><h3>${isEdit ? '📝 Edit Shift' : '✨ Add New Shift'}</h3><div class="form-grid">
    <div class="form-full"><label class="form-label">Shift ID (Unique Code)</label><input id="sfId" class="form-input mono" placeholder="e.g. middle" value="${esc(s.id)}" ${isEdit?'disabled':''}></div>
    <div class="form-full"><label class="form-label">Label (Display Name)</label><input id="sfLabel" class="form-input" placeholder="e.g. 中班" value="${esc(s.label)}"></div>
    <div><label class="form-label">Time Range</label><input id="sfTime" class="form-input mono" placeholder="12:00-20:00" value="${esc(s.time)}"></div>
    <div><label class="form-label">Short Name (Cell Text)</label><input id="sfShort" class="form-input" maxlength="2" placeholder="中" value="${esc(s.short)}"></div>
    <div><label class="form-label">Color Theme</label><div style="display:flex;gap:8px;align-items:center"><input id="sfColor" type="color" class="form-input" style="width:48px;height:38px;padding:2px;cursor:pointer" value="${s.color}" oninput="$('sfColorHex').value=this.value.toUpperCase()"><input id="sfColorHex" class="form-input mono" value="${s.color.toUpperCase()}" oninput="$('sfColor').value=this.value"></div></div>
    <div><label class="form-label">Daily Work Hours</label><input id="sfHours" type="number" step="0.5" class="form-input mono" value="${s.hours}"></div>
  </div><div class="mt-6" style="display:flex;gap:12px;justify-content:flex-end">
    <button class="btn btn-outline" onclick="$('shiftFormModal').remove()">${t('cancel')}</button>
    <button class="btn btn-primary" style="padding-left:32px;padding-right:32px" onclick="saveShift(${sid ? `'${sid}'` : 'null'})">${t('save')}</button>
  </div></div></div>`;
  document.body.insertAdjacentHTML('beforeend',h);
}

async function saveShift(sid){
  const id = sid === null ? $('sfId').value.trim() : sid;
  const data = {
    id: id,
    label: $('sfLabel').value.trim(),
    time: $('sfTime').value.trim(),
    short: $('sfShort').value.trim(),
    color: $('sfColor').value,
    hours: parseFloat($('sfHours').value || 0)
  };
  if(!data.id || !data.short) return alert("ID and Short Name are required");
  try {
    if(sid === null) await api('/admin/shifts',{method:'POST',body:JSON.stringify(data)});
    else await api(`/admin/shifts/${sid}`,{method:'PUT',body:JSON.stringify(data)});
    $('shiftFormModal').remove();
    const oldM = $('shiftModal'); if(oldM) oldM.remove();
    await loadAll(); rSched(); showShiftMgr();
  } catch(e){ alert(e.message) }
}

async function delShift(id){
  if(!confirm("Delete this shift? (Note: System will check if it's currently used in any schedule)")) return;
  try {
    await api(`/admin/shifts/${id}`,{method:'DELETE'});
    $('shiftModal').remove(); await loadAll(); rSched(); showShiftMgr();
  } catch(e){ alert(e.message) }
}
window.showShiftMgr=showShiftMgr; window.openShiftForm=openShiftForm; window.saveShift=saveShift; window.delShift=delShift;

function rowDrag(e){e.dataTransfer.setData("text",e.currentTarget.getAttribute("data-uid"));e.currentTarget.classList.add("dragging")}
function rowOver(e){e.preventDefault();const row=e.currentTarget;if(!row.classList.contains("dragging")){row.style.borderTop="2px solid var(--blue)"}}
function rowDrop(e){
  e.preventDefault();
  const draggingId = e.dataTransfer.getData("text");
  const targetId = e.currentTarget.getAttribute("data-uid");
  e.currentTarget.style.borderTop="";
  document.querySelectorAll("tr").forEach(r=>r.classList.remove("dragging"));
  if(draggingId===targetId)return;
  const tbody = e.currentTarget.parentNode;
  const rows = [...tbody.querySelectorAll("tr[data-uid]")];
  const draggingRow = rows.find(r=>r.getAttribute("data-uid")===draggingId);
  const targetRow = e.currentTarget;
  if(!draggingRow || !targetRow) return;
  
  // Logic to move row
  const draggingIdx = rows.indexOf(draggingRow);
  const targetIdx = rows.indexOf(targetRow);
  if(draggingIdx < targetIdx) targetRow.after(draggingRow);
  else targetRow.before(draggingRow);
  
  // Save order
  const newOrder = [...tbody.querySelectorAll("tr[data-uid]")].map(r=>r.getAttribute("data-uid"));
  api('/users/reorder',{method:'POST',body:JSON.stringify({order:newOrder})}).then(()=>rSched()).catch(err=>alert(err.message));
}
function schP(){if(schM===0){schM=11;schY--}else schM--;rSched()}
function schN(){if(schM===11){schM=0;schY++}else schM++;rSched()}
function togEdit(){editMode=!editMode; if(!editMode) dirtySched={}; rSched()}
function selSh(id){selShift=id;rSched()}
async function setSh(eid,d){ if(!dirtySched[eid])dirtySched[eid]={}; dirtySched[eid][d]=selShift; rSched() }
async function saveSched(){
  const btn = document.querySelector('.sched-tools .btn-primary');
  if(btn) btn.disabled = true;
  try {
    for(const eid in dirtySched){
      for(const d in dirtySched[eid]){
        const dt=`${schY}-${String(schM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        await Schedule.update(eid,dt,dirtySched[eid][d]);
      }
    }
    dirtySched={}; editMode=false; await rSched();
  } catch(e){ alert(e.message); if(btn) btn.disabled = false; }
}
window.saveSched = saveSched; window.setSh = setSh; window.selSh = selSh; window.togEdit = togEdit; window.schP = schP; window.schN = schN;

Auth.me().then(res=>{CU=res.user;loadAll().then(showApp)}).catch(()=>renderLogin());
