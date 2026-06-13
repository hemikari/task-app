// ── DATA ──────────────────────────────────────────────
let data = JSON.parse(localStorage.getItem('taskapp') || 'null') || { projects: [], archive: [] };
let todayPicks = JSON.parse(localStorage.getItem('taskapp-today') || '[]');

// ── TIMER STATE ───────────────────────────────────────
// timerMap: { [tid]: elapsedSeconds }
const timerMap = {};
let activeTimer = null; // { pid, tid, startedAt, interval }

function save() {
  localStorage.setItem('taskapp', JSON.stringify(data));
  localStorage.setItem('taskapp-today', JSON.stringify(todayPicks));
}

// ── DATE HELPERS ──────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0,10);
}
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
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  });
  el.innerHTML = sorted.map(p => renderProject(p)).join('');
}

function renderProject(p) {
  const tasks = p.tasks || [];
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const dl = daysLeft(p.deadline);
  const dlClass = (dl !== null && dl <= 3) ? 'near' : '';
  const dlText = p.deadline ? `${fmtDate(p.deadline)} (${deadlineLabel(p.deadline)})` : '';

  const taskRows = tasks
    .sort((a,b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    })
    .map(t => {
      const tdl = daysLeft(t.deadline);
      const tdlClass = (!t.done && tdl !== null && tdl <= 2) ? 'near' : '';
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
        <span class="task-name${t.done ? ' done' : ''}">${esc(t.name)}</span>
        ${timerDisplay}
        ${t.deadline ? `<span class="task-deadline ${tdlClass}">${fmtDate(t.deadline)}</span>` : ''}
        ${timerBtn}
        <button class="task-del" onclick="deleteTask('${p.id}','${t.id}')" title="削除">×</button>
      </li>`;
    }).join('');

  return `
  <div class="project-block" id="pb-${p.id}">
    <div class="project-header">
      <span class="project-title">${esc(p.name)}</span>
      ${dlText ? `<span class="project-deadline ${dlClass}">${dlText}</span>` : ''}
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
  save();

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
      if (!t.done && t.deadline) items.push({ name: t.name, proj: p.name, deadline: t.deadline });
    });
    if (p.deadline) items.push({ name: p.name, proj: '— project', deadline: p.deadline, isProject: true });
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
        <div class="upcoming-proj">${esc(it.proj)}</div>
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
function addProject() {
  const name = document.getElementById('new-proj-name').value.trim();
  if (!name) return;
  const deadline = document.getElementById('new-proj-date').value || null;
  data.projects.push({ id: uid(), name, deadline, tasks: [] });
  document.getElementById('new-proj-name').value = '';
  document.getElementById('new-proj-date').value = '';
  save(); render();
}

function deleteProject(pid) {
  if (!confirm('このプロジェクトを削除しますか？')) return;
  data.projects = data.projects.filter(p => p.id !== pid);
  save(); render();
}

function addTask(pid) {
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
}

function deleteTask(pid, tid) {
  const proj = data.projects.find(p => p.id === pid);
  if (!proj) return;
  proj.tasks = proj.tasks.filter(t => t.id !== tid);
  save(); render();
}

function toggleTask(pid, tid, checked) {
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
}

function restoreTask(id) {
  const a = data.archive.find(x => x.id === id);
  if (!a) return;
  const proj = data.projects.find(p => p.id === a.pid);
  if (proj) {
    proj.tasks.push({ id: uid(), name: a.name, deadline: null, done: false });
  }
  data.archive = data.archive.filter(x => x.id !== id);
  save(); render();
}

function pickToday() {
  const available = [];
  data.projects.forEach(p => {
    (p.tasks || []).filter(t => !t.done).forEach(t => {
      available.push({ pid: p.id, tid: t.id, name: t.name, deadline: t.deadline });
    });
  });
  if (!available.length) { alert('タスクがありません。'); return; }
  available.sort((a,b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  });
  const top = available.slice(0, Math.min(3, available.length));
  todayPicks = top.map(t => ({ pid: t.pid, tid: t.tid }));
  save(); renderToday();
}

// ── TIMER ─────────────────────────────────────────────
function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function toggleTimer(pid, tid) {
  if (activeTimer && activeTimer.tid === tid) {
    pauseTimer();
  } else {
    if (activeTimer) pauseTimer();
    startTimer(pid, tid);
  }
}

function startTimer(pid, tid) {
  if (!timerMap[tid]) timerMap[tid] = 0;
  const startedAt = Date.now() - timerMap[tid] * 1000;
  const interval = setInterval(() => {
    timerMap[tid] = Math.floor((Date.now() - startedAt) / 1000);
    const el = document.getElementById(`timer-${tid}`);
    if (el) el.textContent = fmtTime(timerMap[tid]);
    renderNowWorking();
  }, 1000);
  activeTimer = { pid, tid, startedAt, interval };
  renderTimerButtons(tid);
  renderNowWorking();
}

function pauseTimer() {
  if (!activeTimer) return;
  clearInterval(activeTimer.interval);
  timerMap[activeTimer.tid] = Math.floor((Date.now() - activeTimer.startedAt) / 1000);
  const prevTid = activeTimer.tid;
  activeTimer = null;
  renderTimerButtons(prevTid);
  renderNowWorking();
}

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
      display.className = `timer-display${isActive ? ' running' : ''}`;
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
  setInterval(() => {
    const timeEl = document.getElementById('now-working-time');
    if (timeEl && activeTimer) timeEl.textContent = fmtTime(timerMap[activeTimer.tid] || 0);
  }, 1000);
}

// ── VIEW SWITCH ───────────────────────────────────────
function switchView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  btn.classList.add('active');
  if (name === 'archive') renderArchive();
}

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

// ── INIT ──────────────────────────────────────────────
document.getElementById('new-proj-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') addProject();
});

setHeaderDate();
render();
