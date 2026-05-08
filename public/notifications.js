/* ── BRATVA NOTIFICATION SYSTEM ── */
(function(){

const NOTIF_CSS = `
.notif-bell-wrap {
  position: relative;
  width: 100%;
}
.notif-bell {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 18px;
  height: 44px;
  width: 100%;
  background: transparent;
  color: #666;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  font-family: 'Rajdhani', sans-serif;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 2px;
  text-transform: uppercase;
  white-space: nowrap;
  transition: color 0.15s, background 0.15s;
  text-align: left;
  box-sizing: border-box;
  position: relative;
}
.notif-bell:hover { color: #e8e8e8; background: rgba(255,255,255,0.04); }
.notif-bell.has-unread { color: #e74c3c; }

.notif-bell-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
  line-height: 1;
}
.notif-bell-label {
  opacity: 0;
  transition: opacity 0.18s 0.06s;
  flex-shrink: 0;
}
.sidebar:hover .notif-bell-label { opacity: 1; }

.notif-badge {
  position: absolute;
  top: 7px;
  left: 32px;
  background: #c0392b;
  color: white;
  font-size: 9px;
  font-weight: 700;
  min-width: 15px;
  height: 15px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  font-family: 'Rajdhani', sans-serif;
  letter-spacing: 0;
  box-shadow: 0 0 6px rgba(192,57,43,0.7);
  pointer-events: none;
  z-index: 10;
}
.notif-badge.hidden { display: none; }

.notif-dropdown {
  position: fixed;
  left: 72px;
  bottom: 60px;
  width: 340px;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(192,57,43,0.1);
  z-index: 9999;
  overflow: hidden;
  display: none;
}
.notif-dropdown.open { display: block; animation: notifFadeIn 0.15s ease; }
@keyframes notifFadeIn {
  from { opacity:0; transform: translateX(-8px); }
  to   { opacity:1; transform: translateX(0); }
}
.notif-drop-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
}
.notif-drop-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 16px; letter-spacing: 2px; color: #e8e8e8;
}
.notif-read-all {
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700; font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
  background: transparent; color: #c0392b; border: none; cursor: pointer; padding: 3px 0;
  transition: color 0.15s;
}
.notif-read-all:hover { color: #e74c3c; }
.notif-list { max-height: 360px; overflow-y: auto; }
.notif-list::-webkit-scrollbar { width: 4px; }
.notif-list::-webkit-scrollbar-track { background: #111; }
.notif-list::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

.notif-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 16px; border-bottom: 1px solid #1a1a1a;
  cursor: pointer; transition: background 0.12s;
  text-decoration: none; color: inherit;
}
.notif-item:hover { background: rgba(255,255,255,0.03); }
.notif-item.unread { background: rgba(192,57,43,0.06); }
.notif-item.unread:hover { background: rgba(192,57,43,0.1); }
.notif-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #c0392b;
  flex-shrink: 0; margin-top: 5px; box-shadow: 0 0 6px rgba(192,57,43,0.5);
}
.notif-item.read .notif-dot { background: #333; box-shadow: none; }
.notif-content { flex: 1; min-width: 0; }
.notif-msg {
  font-family: 'Rajdhani', sans-serif; font-size: 13px; font-weight: 600;
  color: #e8e8e8; line-height: 1.4; margin-bottom: 3px;
}
.notif-item.read .notif-msg { color: #888; font-weight: 500; }
.notif-time { font-size: 11px; color: #555; letter-spacing: 0.5px; }
.notif-empty {
  padding: 32px 16px; text-align: center; color: #555;
  font-family: 'Rajdhani', sans-serif; font-size: 13px; letter-spacing: 1px;
}
`;

function injectCSS(){
  const style = document.createElement('style');
  style.textContent = NOTIF_CSS;
  document.head.appendChild(style);
}

function timeAgo(dateStr){
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if(diff < 60) return 'acum câteva secunde';
  if(diff < 3600) return `acum ${Math.floor(diff/60)} min`;
  if(diff < 86400) return `acum ${Math.floor(diff/3600)}h`;
  return d.toLocaleDateString('ro-RO');
}

function buildBell(){
  const wrap = document.createElement('div');
  wrap.className = 'notif-bell-wrap';
  wrap.innerHTML = `
    <button class="notif-bell" id="notifBell" title="Notificări">
      <span class="notif-bell-icon">🔔</span>
      <span class="notif-bell-label">Notificări</span>
      <span class="notif-badge hidden" id="notifBadge">0</span>
    </button>
    <div class="notif-dropdown" id="notifDropdown">
      <div class="notif-drop-header">
        <span class="notif-drop-title">🔔 Notificări</span>
        <button class="notif-read-all" id="notifReadAll">Marchează toate</button>
      </div>
      <div class="notif-list" id="notifList">
        <div class="notif-empty">Se încarcă...</div>
      </div>
    </div>`;
  return wrap;
}

function injectBell(){
  const sbNav = document.querySelector('.sb-nav');
  if(!sbNav) return;

  const bell = buildBell();
  sbNav.insertBefore(bell, sbNav.firstChild);

  // Wire events after DOM insertion
  document.getElementById('notifBell').addEventListener('click', (e) => {
    e.stopPropagation();
    window.NotifSystem.toggle();
  });
  document.getElementById('notifReadAll').addEventListener('click', (e) => {
    e.stopPropagation();
    window.NotifSystem.markAll();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('notifDropdown');
    const bell = document.getElementById('notifBell');
    if(dd && bell && !bell.closest('.notif-bell-wrap').contains(e.target)){
      dd.classList.remove('open');
    }
  });
}

let notifications = [];

function renderList(){
  const list = document.getElementById('notifList');
  if(!list) return;
  if(!notifications.length){
    list.innerHTML = '<div class="notif-empty">📭 Nicio notificare</div>';
    return;
  }
  list.innerHTML = notifications.map(n => {
    const cls = n.read ? 'read' : 'unread';
    const href = n.taskId ? `task.html#task-${n.taskId}` : '#';
    return `<a class="notif-item ${cls}" href="${href}" data-id="${n.id}">
      <div class="notif-dot"></div>
      <div class="notif-content">
        <div class="notif-msg">${n.message}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
    </a>`;
  }).join('');

  // Wire click events
  list.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => {
      window.NotifSystem.markOne(parseInt(el.dataset.id));
    });
  });
}

function updateBadge(count){
  const badge = document.getElementById('notifBadge');
  const bell  = document.getElementById('notifBell');
  if(!badge || !bell) return;
  if(count > 0){
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
    bell.classList.add('has-unread');
  } else {
    badge.classList.add('hidden');
    bell.classList.remove('has-unread');
  }
}

async function fetchNotifications(){
  try {
    const res = await fetch('/notifications');
    if(!res.ok) return;
    notifications = await res.json();
    updateBadge(notifications.filter(n => !n.read).length);
    renderList();
  } catch(e){}
}

window.NotifSystem = {
  toggle(){
    const dd = document.getElementById('notifDropdown');
    if(!dd) return;
    const wasOpen = dd.classList.contains('open');
    dd.classList.toggle('open');
    if(!wasOpen) fetchNotifications();
  },
  async markOne(id){
    try {
      await fetch(`/notifications/${id}/read`, { method: 'PATCH' });
      const n = notifications.find(x => x.id === id);
      if(n) n.read = 1;
      updateBadge(notifications.filter(x => !x.read).length);
      renderList();
    } catch(e){}
  },
  async markAll(){
    try {
      await fetch('/notifications/read-all', { method: 'POST' });
      notifications.forEach(n => n.read = 1);
      updateBadge(0);
      renderList();
    } catch(e){}
  }
};

async function pollCount(){
  try {
    const res = await fetch('/notifications/count');
    if(!res.ok) return;
    const data = await res.json();
    updateBadge(data.count);
  } catch(e){}
}

function init(){
  injectCSS();
  injectBell();
  fetchNotifications();
  setInterval(pollCount, 30000);

  // Scroll to task if hash present
  if(window.location.pathname.includes('task.html') && window.location.hash){
    const targetId = window.location.hash.substring(1);
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if(el){
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid #c0392b';
        setTimeout(() => el.style.outline = '', 2000);
      }
    }, 800);
  }
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();