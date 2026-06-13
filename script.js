import { auth, db, loginWithGoogle, logout, onAuthStateChanged, loadUserData, saveUserData }
  from './firebase.js';

// ── DATA ──────────────────────────────────────────────
let data = { projects: [], archive: [] };
let todayPicks = JSON.parse(localStorage.getItem('taskapp-today') || '[]');
let currentUid = null;

// ── TIMER STATE ───────────────────────────────────────
const timerMap = {};
let activeTimer = null;

// ── SAVE ──────────────────────────────────────────────
async function save() {
  localStorage.setItem('taskapp-today', JSON.stringify(todayPicks));
  if (currentUid) await saveUserData(currentUid, data);
}

// ── DATE HELPERS ──────────────────────────────────────
function today() { return new Date().toISOString().slice(0,10); }
function daysLeft(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - now) / 86400000);
}
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}`;
}
function deadlineLabel(dateStr) {
  const n = daysLeft(dateStr);
  if (n === null) return '';
  if (n < 0) return `${Math.abs(n)}d over`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `${n}d`;
}

// ── ID ────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ── ESCAPE ────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── RENDER PROJECTS ───────────────────────────────────
function renderProjects() {
  const el = document.getElementById('projects-list');
  if (!data.projects.length) {
    el.innerHTML = '<div class="empty-state">No projects yet.</div>';
    return;
  }
  const sorted = [...data.projects].sort((a,b) => {
    const aDate = a.softDeadline || a.deadline;
    const bDate = b.softDeadline || b.deadline;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate < bDate ? -1 : 1;
  });
  el.innerHTML = sorted.map(p => renderProject(p)).join('');
}

function renderDeadlines(item, pidOrTid, type) {
  const sdl = daysLeft(item.softDeadline);
  const fdl = daysLeft(item.deadline);
  const sdlClass = (!item.done && sdl !== null && sdl <= 3) ? 'near' : '';
  const fdlClass = (!item.done && fdl !== null && fdl <= 3) ? 'near' : '';
  const editSoft = type === 'project'
    ? `onclick="editField('${pidOrTid}',null,'softDeadline',this)"`
    : `onclick="editField('${pidOrTid.pid}','${pidOrTid.tid}','softDeadline',this)"`;
  const editFinal = type === 'project'
    ? `onclick="editField('${pidOrTid}',null,'deadline',this)"`
    : `onclick="editField('${pidOrTid.pid}','${pidOrTid.tid}','deadline',this)"`;
  const soft = `<span class="dl-soft ${sdlClass}" ${editSoft} title="一旦締め切り">${item.softDeadline ? '一旦 ' + fmtDate(item.softDeadline) : '<span class="edit-hint">一旦</span>'}</span>`;
  const final = `<span class="dl-final ${fdlClass}" ${editFinal} title="最終締め切り">${item.deadline ? '最終 ' + fmtDate(item.deadline) : '<span class="edit-hint">最終</span>'}</span>`;
  return `<span class="dl-wrap">${soft}${final}</span>`;
}

function renderProject(p) {
  const tasks = p.tasks || [];
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;

  const taskRows = tasks
    .sort((a,b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aDate = a.softDeadline || a.deadline;
      const bDate = b.softDeadline || b.deadline;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate < bDate ? -1 : 1;
    })
    .map(t => {
      const isActive = activeTimer && activeTimer.tid === t.id;
      const elapsed = timerMap[t.id] || 0;
      const hasTime = elapsed > 0;
      const timerBtn = t.done ? '' : `
        <button class="timer-btn ${isActive ? 'running' : ''} ${hasTime && !isActive ? 'paused' : ''}"
          onclick="toggleTimer('${p.id}','${t.id}')" title="${isActive ? '一時停止' : '開始'}">
          ${isActive ? '■' : '▶'}
        </button>`;
      const timerDisplay = (hasTime || isActive) && !t.done
        ? `<span class="timer-display ${isActive ? 'running' : ''}" id="timer-${t.id}">${fmtTime(elapsed)}</span>`
        : '';
      return `
      <li class="task-row" data-tid="${t.id}" data-pid="${p.id}">
        <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''} onchange="toggleTask('${p.id}','${t.id}',this.checked)" />
        <span class="task-name${t.done ? ' done' : ''}" onclick="editField('${p.id}','${t.id}','name',this)">${esc(t.name)}</span>
        ${timerDisplay}
        ${renderDeadlines(t, {pid: p.id, tid: t.id}, 'task')}
        ${timerBtn}
        <button class="task-del" onclick="deleteTask('${p.id}','${t.id}')" title="削除">×</button>
      </li>`;
    }).join('');

  return `
  <div class="project-block" id="pb-${p.id}">
    <div class="project-header">
      <span class="project-title" onclick="editField('${p.id}',null,'name',this)">${esc(p.name)}</span>
      ${renderDeadlines(p, p.id, 'project')}
      <div class="project-actions">
        <button class="icon-btn del" onclick="deleteProject('${p.id}')" title="削除">Delete</button>
      </div>
    </div>
    <div class="progress-wrap">
      <div class="progress-fill" style="width:${pct}%"></div>
      <span class="progress-label">${done}/${total}</span>
    </div>
    <ul class="task-list">${taskRows}</ul>
    <div class="add-task-row">
      <input type="text" placeholder="タスクを追加…" id="ti-${p.id}" onkeydown="if(event.key==='Enter')addTask('${p.id}')" />
      <input type="date" id="td-${p.id}" />
      <button onclick="addTask('${p.id}')">Add</button>
    </div>
  </div>`;
}

// ── RENDER TODAY ──────────────────────────────────────
function renderToday() {
  const el = document.getElementById('today-list');
  todayPicks = todayPicks.filter(pick => {
    const proj = data.projects.find(p => p.id === pick.pid);
    if (!proj) return false;
    const task = proj.tasks.find(t => t.id === pick.tid);
    return task && !task.done;
  });
  if (!todayPicks.length) {
    el.innerHTML = '<li class="today-empty">まだ選択されていません。</li>';
    return;
  }
  el.innerHTML = todayPicks.map((pick, i) => {
    const proj = data.projects.find(p => p.id === pick.pid);
    const task = proj?.tasks.find(t => t.id === pick.tid);
    if (!task) return '';
    return `<li class="today-item">
      <span class="today-item-num">${i+1}</span>
      <span>
        <span class="today-item-name">${esc(task.name)}</span><br>
        <span class="today-item-proj">${esc(proj.name)}</span>
      </span>
    </li>`;
  }).join('');
}

// ── RENDER UPCOMING ───────────────────────────────────
function renderUpcoming() {
  const el = document.getElementById('upcoming-list');
  const items = [];
  data.projects.forEach(p => {
    (p.tasks || []).forEach(t => {
      if (t.done) return;
      if (t.softDeadline) items.push({ name: t.name, proj: p.name, deadline: t.softDeadline, label: '一旦' });
      if (t.deadline) items.push({ name: t.name, proj: p.name, deadline: t.deadline, label: '最終' });
    });
    if (p.softDeadline) items.push({ name: p.name, proj: '— project', deadline: p.softDeadline, label: '一旦' });
    if (p.deadline) items.push({ name: p.name, proj: '— project', deadline: p.deadline, label: '最終' });
  });
  items.sort((a,b) => a.deadline < b.deadline ? -1 : 1);
  const shown = items.slice(0, 8);
  if (!shown.length) { el.innerHTML = '<li class="today-empty">No deadlines.</li>'; return; }
  el.innerHTML = shown.map(it => {
    const n = daysLeft(it.deadline);
    const cls = n === null ? '' : n <= 2 ? 'near' : n === 0 ? 'today' : '';
    return `<li class="upcoming-item">
      <div>
        <span class="upcoming-days ${cls}">${n === null ? '—' : n <= 0 ? 0 : n}</span>
        <span class="upcoming-days-label">days</span>
      </div>
      <div class="upcoming-info">
        <div class="upcoming-name">${esc(it.name)}</div>
        <div class="upcoming-proj">${it.label ? `<span class="dl-label-${it.label === '一旦' ? 'soft' : 'final'}">${it.label}</span> ` : ''}${esc(it.proj)}</div>
      </div>
    </li>`;
  }).join('');
}

// ── RENDER ARCHIVE ────────────────────────────────────
function renderArchive() {
  const el = document.getElementById('archive-list');
  if (!data.archive.length) { el.innerHTML = '<div class="empty-state">Nothing archived yet.</div>'; return; }
  const byProj = {};
  data.archive.forEach(a => {
    if (!byProj[a.projName]) byProj[a.projName] = [];
    byProj[a.projName].push(a);
  });
  el.innerHTML = Object.entries(byProj).map(([proj, items]) => `
    <div class="archive-group">
      <div class="archive-group-title">${esc(proj)}</div>
      ${items.map(a => `
        <div class="archive-item">
          <span style="flex:1">${esc(a.name)}</span>
          <span class="archive-date">${a.completedAt || ''}</span>
          <button class="archive-restore" onclick="restoreTask('${a.id}')">restore</button>
        </div>`).join('')}
    </div>`).join('');
}

// ── ACTIONS ───────────────────────────────────────────
window.addProject = function() {
  const name = document.getElementById('new-proj-name').value.trim();
  if (!name) return;
  const deadline = document.getElementById('new-proj-date').value || null;
  data.projects.push({ id: uid(), name, deadline, tasks: [] });
  document.getElementById('new-proj-name').value = '';
  document.getElementById('new-proj-date').value = '';
  save(); render();
};

window.deleteProject = function(pid) {
  if (!confirm('このプロジェクトを削除しますか？')) return;
  data.projects = data.projects.filter(p => p.id !== pid);
  save(); render();
};

window.addTask = function(pid) {
  const nameEl = document.getElementById(`ti-${pid}`);
  const dateEl = document.getElementById(`td-${pid}`);
  const name = nameEl.value.trim();
  if (!name) return;
  const proj = data.projects.find(p => p.id === pid);
  if (!proj) return;
  proj.tasks.push({ id: uid(), name, deadline: dateEl.value || null, done: false });
  nameEl.value = '';
  dateEl.value = '';
  save(); render();
};

window.deleteTask = function(pid, tid) {
  const proj = data.projects.find(p => p.id === pid);
  if (!proj) return;
  proj.tasks = proj.tasks.filter(t => t.id !== tid);
  save(); render();
};

window.toggleTask = function(pid, tid, checked) {
  const proj = data.projects.find(p => p.id === pid);
  if (!proj) return;
  const task = proj.tasks.find(t => t.id === tid);
  if (!task) return;
  task.done = checked;
  if (checked) {
    data.archive.unshift({ id: task.id, name: task.name, projName: proj.name, pid, completedAt: today() });
    proj.tasks = proj.tasks.filter(t => t.id !== tid);
    todayPicks = todayPicks.filter(p => p.tid !== tid);
  }
  save(); render();
};

window.restoreTask = function(id) {
  const a = data.archive.find(x => x.id === id);
  if (!a) return;
  const proj = data.projects.find(p => p.id === a.pid);
  if (proj) proj.tasks.push({ id: uid(), name: a.name, deadline: null, done: false });
  data.archive = data.archive.filter(x => x.id !== id);
  save(); render();
};

window.pickToday = function() {
  const available = [];
  data.projects.forEach(p => {
    (p.tasks || []).filter(t => !t.done).forEach(t => {
      available.push({ pid: p.id, tid: t.id, deadline: t.softDeadline || t.deadline });
    });
  });
  if (!available.length) { alert('タスクがありません。'); return; }
  available.sort((a,b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  });
  todayPicks = available.slice(0, Math.min(3, available.length)).map(t => ({ pid: t.pid, tid: t.tid }));
  localStorage.setItem('taskapp-today', JSON.stringify(todayPicks));
  renderToday();
};

// ── INLINE EDIT ───────────────────────────────────────
window.editField = function(pid, tid, field, el) {
  const proj = data.projects.find(p => p.id === pid);
  if (!proj) return;
  const target = tid ? proj.tasks.find(t => t.id === tid) : proj;
  if (!target) return;

  const isDate = field === 'deadline' || field === 'softDeadline';
  const input = document.createElement('input');
  input.type = isDate ? 'date' : 'text';
  input.value = target[field] || '';
  input.className = isDate ? 'inline-edit inline-edit-date' : 'inline-edit';
  el.replaceWith(input);
  input.focus();
  if (!isDate) input.select();

  const commit = () => {
    if (isDate) {
      target[field] = input.value || null;
    } else {
      const val = input.value.trim();
      if (val) target[field] = val;
    }
    save(); render();
  };
  input.addEventListener('blur', commit);
  if (isDate) {
    input.addEventListener('change', () => input.blur());
  } else {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = target[field] || ''; input.blur(); }
    });
  }
};

// ── TIMER ─────────────────────────────────────────────
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

window.toggleTimer = function(pid, tid) {
  if (activeTimer && activeTimer.tid === tid) pauseTimer();
  else { if (activeTimer) pauseTimer(); startTimer(pid, tid); }
};

function startTimer(pid, tid) {
  if (!timerMap[tid]) timerMap[tid] = 0;
  const startedAt = Date.now() - timerMap[tid] * 1000;
  const interval = setInterval(() => {
    timerMap[tid] = Math.floor((Date.now() - startedAt) / 1000);
    const el = document.getElementById(`timer-${tid}`);
    if (el) el.textContent = fmtTime(timerMap[tid]);
    const timeEl = document.getElementById('now-working-time');
    if (timeEl) timeEl.textContent = fmtTime(timerMap[tid]);
  }, 1000);
  activeTimer = { pid, tid, startedAt, interval };
  renderTimerButtons(tid);
  renderNowWorking();
}

window.pauseTimer = function() {
  if (!activeTimer) return;
  clearInterval(activeTimer.interval);
  timerMap[activeTimer.tid] = Math.floor((Date.now() - activeTimer.startedAt) / 1000);
  const prevTid = activeTimer.tid;
  activeTimer = null;
  renderTimerButtons(prevTid);
  renderNowWorking();
};

function renderTimerButtons(tid) {
  const row = document.querySelector(`[data-tid="${tid}"]`);
  if (!row) return;
  const isActive = activeTimer && activeTimer.tid === tid;
  const elapsed = timerMap[tid] || 0;
  const btn = row.querySelector('.timer-btn');
  if (btn) {
    btn.textContent = isActive ? '■' : '▶';
    btn.className = `timer-btn ${isActive ? 'running' : elapsed > 0 ? 'paused' : ''}`;
  }
  let display = row.querySelector('.timer-display');
  if (elapsed > 0 || isActive) {
    if (!display) {
      display = document.createElement('span');
      display.id = `timer-${tid}`;
      const nameEl = row.querySelector('.task-name');
      nameEl.after(display);
    }
    display.textContent = fmtTime(elapsed);
    display.className = `timer-display${isActive ? ' running' : ''}`;
  }
}

function renderNowWorking() {
  const el = document.getElementById('now-working');
  if (!el) return;
  if (!activeTimer) {
    el.innerHTML = '<span class="now-working-empty">作業中のタスクなし</span>';
    return;
  }
  const proj = data.projects.find(p => p.id === activeTimer.pid);
  const task = proj?.tasks.find(t => t.id === activeTimer.tid);
  if (!task) return;
  const elapsed = timerMap[activeTimer.tid] || 0;
  el.innerHTML = `
    <div class="now-working-name">${esc(task.name)}</div>
    <div class="now-working-proj">${esc(proj.name)}</div>
    <div class="now-working-time" id="now-working-time">${fmtTime(elapsed)}</div>
    <button class="now-working-stop" onclick="pauseTimer()">■ 停止</button>
  `;
}

// ── VIEW SWITCH ───────────────────────────────────────
window.switchView = function(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  btn.classList.add('active');
  if (name === 'archive') renderArchive();
};

// ── HEADER DATE ───────────────────────────────────────
function setHeaderDate() {
  const d = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  document.getElementById('header-date').textContent =
    `${days[d.getDay()]}. ${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

// ── RENDER ALL ────────────────────────────────────────
function render() {
  renderProjects();
  renderToday();
  renderUpcoming();
}

// ── AUTH ──────────────────────────────────────────────
function showApp(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const avatar = document.getElementById('user-avatar');
  if (user.photoURL) { avatar.src = user.photoURL; avatar.style.display = 'block'; }
  setHeaderDate();
  document.getElementById('new-proj-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.addProject();
  });
  render();
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

document.getElementById('login-btn').addEventListener('click', () => loginWithGoogle());
document.getElementById('logout-btn').addEventListener('click', () => logout());

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    data = await loadUserData(user.uid);
    showApp(user);
  } else {
    currentUid = null;
    data = { projects: [], archive: [] };
    showLogin();
  }
});
