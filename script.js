/* ==========================================================================
   Signal Room — 100% local dans le navigateur
   --------------------------------------------------------------------------
   Aucun serveur, aucune configuration. Comptes et messages sont stockés
   dans le navigateur (localStorage), pas de cookies.

   IMPORTANT : chaque navigateur a sa propre copie. Deux personnes sur deux
   appareils différents ne verront pas les mêmes messages — pour un vrai
   chat partagé entre plusieurs personnes, il faut un backend (voir
   README.md, section "Aller plus loin").
   ========================================================================== */

const USERS_KEY = 'signalroom_users_v1';
const SESSION_KEY = 'signalroom_session_v1';
const MESSAGES_KEY = 'signalroom_messages_v1';
const MESSAGE_LIFETIME_MS = 60 * 60 * 1000; // 1 heure

const CHANNELS = [
  { id: 'general', name: 'général', topic: 'Discussion générale' },
  { id: 'annonces', name: 'annonces', topic: "Les infos importantes de la communauté" },
  { id: 'aide', name: 'aide', topic: 'Pose tes questions ici' },
  { id: 'off-topic', name: 'off-topic', topic: 'Tout sauf le sujet principal' },
];

let state = { channel: 'general', username: null };

/* ---------- Stockage : utilisateurs ---------- */
function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Stockage : messages ---------- */
function loadAllMessages() {
  try { return JSON.parse(localStorage.getItem(MESSAGES_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveAllMessages(messages) { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)); }

function purgeOldMessages(messages) {
  const cutoff = Date.now() - MESSAGE_LIFETIME_MS;
  Object.keys(messages).forEach(ch => {
    messages[ch] = (messages[ch] || []).filter(m => m.t >= cutoff);
  });
  return messages;
}

/* =========================== ÉCRAN D'AUTHENTIFICATION =========================== */

let authMode = 'login';

const authScreen = document.getElementById('authScreen');
const appEl = document.getElementById('app');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authForm = document.getElementById('authForm');
const authSubmit = document.getElementById('authSubmit');
const authError = document.getElementById('authError');
const authHint = document.getElementById('authHint');
const switchText = document.getElementById('switchText');
const switchLink = document.getElementById('switchLink');

function setAuthMode(mode) {
  authMode = mode;
  authError.textContent = '';
  authHint.textContent = '';
  if (mode === 'login') {
    authTitle.textContent = 'Content de te revoir !';
    authSubtitle.textContent = 'Nous sommes ravis de te revoir.';
    authSubmit.textContent = 'Se connecter';
    switchText.textContent = "Besoin d'un compte ?";
    switchLink.textContent = 'Inscription';
  } else {
    authTitle.textContent = 'Créer un compte';
    authSubtitle.textContent = "Bienvenue, ça ne prend qu'une minute.";
    authSubmit.textContent = 'Créer mon compte';
    switchText.textContent = 'Tu as déjà un compte ?';
    switchLink.textContent = 'Connexion';
  }
}
switchLink.addEventListener('click', (e) => {
  e.preventDefault();
  setAuthMode(authMode === 'login' ? 'signup' : 'login');
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  authHint.textContent = '';
  authSubmit.disabled = true;

  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;

  try {
    if (!username) throw new Error('Choisis un pseudo.');
    if (username.length < 4) throw new Error('Le pseudo doit faire au moins 4 caractères.');
    if (!password) throw new Error('Choisis un mot de passe.');

    const users = getUsers();
    const key = username.toLowerCase();

    if (authMode === 'signup') {
      if (users[key]) throw new Error('Ce pseudo est déjà pris.');
      users[key] = { displayName: username, passwordHash: await hashPassword(password) };
      saveUsers(users);
      enterApp(username);
    } else {
      const record = users[key];
      if (!record || record.passwordHash !== await hashPassword(password)) {
        throw new Error('Pseudo ou mot de passe incorrect.');
      }
      enterApp(record.displayName);
    }
  } catch (err) {
    authError.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
  }
});

/* =========================== ENTRÉE DANS L'APPLICATION =========================== */

function enterApp(username) {
  state.username = username;
  localStorage.setItem(SESSION_KEY, username);

  authScreen.classList.add('is-hidden');
  appEl.classList.remove('is-hidden');

  document.getElementById('myName').textContent = username;
  document.getElementById('myAvatar').textContent = initials(username);
  document.getElementById('myAvatar').style.background = colorFor(username);

  renderChannels();
  selectChannel('general');
  renderMembers();
}

document.getElementById('settingsBtn').addEventListener('click', () => {
  if (confirm('Se déconnecter ?')) {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  }
});

/* Reprend la session si déjà connecté sur ce navigateur */
(function checkExistingSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  const users = getUsers();
  if (saved && users[saved.toLowerCase()]) {
    enterApp(users[saved.toLowerCase()].displayName);
  }
})();

/* =========================== CANAUX =========================== */

function renderChannels() {
  const el = document.getElementById('channelList');
  el.innerHTML = '';
  CHANNELS.forEach(c => {
    const div = document.createElement('div');
    div.className = 'channel' + (c.id === state.channel ? ' is-active' : '');
    div.innerHTML = `<span class="hash">#</span><span>${escapeHtml(c.name)}</span>`;
    div.addEventListener('click', () => selectChannel(c.id));
    el.appendChild(div);
  });
}

function selectChannel(id) {
  state.channel = id;
  const c = CHANNELS.find(ch => ch.id === id);
  document.getElementById('channelName').textContent = c.name;
  document.getElementById('channelTopic').textContent = c.topic;
  document.getElementById('composerInput').placeholder = `Écrire dans #${c.name}`;
  renderChannels();
  closeMobilePanels();
  renderMessages();
}

/* =========================== MEMBRES (démo statique) =========================== */

function renderMembers() {
  const el = document.getElementById('membersList');
  el.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'channels__label';
  label.textContent = 'Toi';
  el.appendChild(label);
  const div = document.createElement('div');
  div.className = 'member';
  div.innerHTML = `<span class="member__avatar">${initials(state.username)}</span><span class="member__name">${escapeHtml(state.username)}</span>`;
  el.appendChild(div);
}

/* =========================== MESSAGES =========================== */

function renderMessages() {
  const el = document.getElementById('messages');
  el.innerHTML = '';

  let messages = purgeOldMessages(loadAllMessages());
  saveAllMessages(messages);

  const list = messages[state.channel] || [];
  let lastAuthor = null;
  let lastTime = 0;

  list.forEach(m => {
    const sameGroup = m.author === lastAuthor && (m.t - lastTime) < 1000 * 60 * 4;
    if (sameGroup) {
      const group = document.createElement('div');
      group.className = 'msg-group';
      group.dataset.t = String(m.t);
      group.innerHTML = `
        <span class="msg__time-hover">${formatTime(m.t)}</span>
        <div class="msg__text">${escapeHtml(m.text)}</div>
      `;
      el.appendChild(group);
    } else {
      const msg = document.createElement('div');
      msg.className = 'msg' + (m.author === state.username ? ' is-me' : '');
      msg.dataset.t = String(m.t);
      msg.innerHTML = `
        <div class="msg__avatar" style="background:${colorFor(m.author)}">${initials(m.author)}</div>
        <div class="msg__body">
          <div class="msg__meta">
            <span class="msg__author">${escapeHtml(m.author)}</span>
            <span class="msg__time">${formatTime(m.t)}</span>
          </div>
          <div class="msg__text">${escapeHtml(m.text)}</div>
        </div>
      `;
      el.appendChild(msg);
    }
    lastAuthor = m.author;
    lastTime = m.t;
  });

  el.scrollTop = el.scrollHeight;
}

document.getElementById('composerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('composerInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  let messages = purgeOldMessages(loadAllMessages());
  if (!messages[state.channel]) messages[state.channel] = [];
  messages[state.channel].push({ author: state.username, text, t: Date.now() });
  saveAllMessages(messages);
  renderMessages();
});

/* Synchro entre onglets ouverts sur le même navigateur */
window.addEventListener('storage', (e) => {
  if (e.key === MESSAGES_KEY) renderMessages();
});

/* Purge automatique toutes les minutes, même sans nouveau message */
setInterval(() => { if (state.username) renderMessages(); }, 60 * 1000);

/* =========================== UTILITAIRES =========================== */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function initials(name) { return (name || '?').trim().slice(0, 2).toUpperCase(); }
function formatTime(t) {
  const d = new Date(t);
  const isToday = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Aujourd'hui à ${time}` : `${d.toLocaleDateString('fr-FR')} ${time}`;
}
const PALETTE = ['#6C6FFF', '#3ED598', '#FF8A5C', '#FF5C7A', '#5CC8FF', '#C77CFF'];
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/* =========================== PANNEAUX MOBILES =========================== */

const overlay = document.getElementById('overlay');
function closeMobilePanels() { appEl.classList.remove('nav-open', 'members-open'); }

document.getElementById('openChannels').addEventListener('click', () => appEl.classList.add('nav-open'));
document.getElementById('closeChannels').addEventListener('click', closeMobilePanels);
document.getElementById('openMembers').addEventListener('click', () => appEl.classList.add('members-open'));
document.getElementById('closeMembers').addEventListener('click', closeMobilePanels);
overlay.addEventListener('click', closeMobilePanels);
