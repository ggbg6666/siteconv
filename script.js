/* ==========================================================================
   Signal Room — interface de chat façon Discord
   --------------------------------------------------------------------------
   Cette démo fonctionne 100% côté navigateur : les messages sont stockés
   dans localStorage. Deux onglets ouverts sur le même navigateur se
   synchronisent entre eux (grâce à l'événement "storage"), mais deux
   personnes sur deux appareils différents NE VERRONT PAS les mêmes messages
   tant qu'il n'y a pas de vrai backend derrière.

   Pour brancher un vrai backend temps réel (multi-utilisateurs), voir les
   commentaires "BACKEND HOOK" plus bas, et le README.md fourni.
   ========================================================================== */

const STORAGE_KEY = 'signalroom_messages_v1';
const NAME_KEY = 'signalroom_username_v1';

const SERVERS = [
  { id: 'main', name: 'Le Repaire', tag: 'LR' },
  { id: 'gaming', name: 'Zone Gaming', tag: 'ZG' },
  { id: 'work', name: "Coin d'étude", tag: 'CE' },
];

const CHANNELS = [
  { id: 'general', name: 'général', topic: 'Discussion générale' },
  { id: 'annonces', name: 'annonces', topic: "Les infos importantes de la communauté" },
  { id: 'aide', name: 'aide', topic: 'Pose tes questions ici' },
  { id: 'off-topic', name: 'off-topic', topic: 'Tout sauf le sujet principal' },
];

const DMS = [
  { id: 'dm-lea', name: 'Léa', online: true },
  { id: 'dm-sam', name: 'Sam', online: true },
  { id: 'dm-nova', name: 'Nova', online: false },
];

const MEMBERS = [
  { name: 'Léa', online: true },
  { name: 'Sam', online: true },
  { name: 'Théo', online: true },
  { name: 'Nova', online: false },
  { name: 'Iris', online: false },
];

const SEED_MESSAGES = {
  general: [
    { author: 'Léa', text: 'Salut tout le monde ! Bienvenue sur Signal Room 👋', t: Date.now() - 1000 * 60 * 60 * 5 },
    { author: 'Sam', text: "On peut personnaliser ça facilement pour n'importe quel projet.", t: Date.now() - 1000 * 60 * 58 * 5 },
    { author: 'Théo', text: 'Le thème sombre est propre 🔥', t: Date.now() - 1000 * 60 * 40 },
  ],
  annonces: [
    { author: 'Léa', text: 'Nouvelle version déployée sur Vercel ce matin.', t: Date.now() - 1000 * 60 * 60 * 2 },
  ],
  aide: [],
  'off-topic': [
    { author: 'Nova', text: "Quelqu'un a vu le dernier épisode ?", t: Date.now() - 1000 * 60 * 90 },
  ],
};

let state = {
  server: 'main',
  channel: 'general',
  username: localStorage.getItem(NAME_KEY) || '',
};

function loadMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED_MESSAGES));
  } catch (e) {
    return JSON.parse(JSON.stringify(SEED_MESSAGES));
  }
}

function saveMessages(messages) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (e) {
    console.error('Impossible de sauvegarder les messages', e);
  }
}

let messages = loadMessages();

/* ---------- Rendu du rail de serveurs ---------- */
function renderRail() {
  const el = document.getElementById('railServers');
  el.innerHTML = '';
  SERVERS.forEach(s => {
    const div = document.createElement('div');
    div.className = 'rail__item' + (s.id === state.server ? ' is-active' : '');
    div.textContent = s.tag;
    div.title = s.name;
    div.addEventListener('click', () => {
      state.server = s.id;
      document.getElementById('serverName').textContent = s.name;
      renderRail();
    });
    el.appendChild(div);
  });
}

/* ---------- Rendu de la liste des canaux ---------- */
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

function renderDMs() {
  const el = document.getElementById('dmList');
  el.innerHTML = '<div class="channels__label">Messages privés</div>';
  DMS.forEach(d => {
    const div = document.createElement('div');
    div.className = 'dm-entry';
    div.innerHTML = `<span class="dm-avatar${d.online ? '' : ' offline'}">${initials(d.name)}</span><span>${escapeHtml(d.name)}</span>`;
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
  renderMessages();
  closeMobilePanels();
}

/* ---------- Rendu des membres ---------- */
function renderMembers() {
  const el = document.getElementById('membersList');
  el.innerHTML = '';
  const online = MEMBERS.filter(m => m.online);
  const offline = MEMBERS.filter(m => !m.online);

  if (online.length) {
    const label = document.createElement('div');
    label.className = 'channels__label';
    label.textContent = `En ligne — ${online.length}`;
    el.appendChild(label);
    online.forEach(m => el.appendChild(memberRow(m)));
  }
  if (offline.length) {
    const label = document.createElement('div');
    label.className = 'channels__label';
    label.textContent = `Hors ligne — ${offline.length}`;
    el.appendChild(label);
    offline.forEach(m => el.appendChild(memberRow(m)));
  }
}

function memberRow(m) {
  const div = document.createElement('div');
  div.className = 'member' + (m.online ? '' : ' offline');
  div.innerHTML = `<span class="member__avatar${m.online ? '' : ' offline'}">${initials(m.name)}</span><span class="member__name">${escapeHtml(m.name)}</span>`;
  return div;
}

/* ---------- Rendu des messages ---------- */
function renderMessages() {
  const el = document.getElementById('messages');
  el.innerHTML = '';
  const list = messages[state.channel] || [];

  let lastAuthor = null;
  let lastTime = 0;

  list.forEach(m => {
    const sameGroup = m.author === lastAuthor && (m.t - lastTime) < 1000 * 60 * 4;
    if (sameGroup) {
      const group = document.createElement('div');
      group.className = 'msg-group';
      group.innerHTML = `
        <span class="msg__time-hover">${formatTime(m.t)}</span>
        <div class="msg__text">${escapeHtml(m.text)}</div>
      `;
      el.appendChild(group);
    } else {
      const msg = document.createElement('div');
      msg.className = 'msg' + (m.author === state.username ? ' is-me' : '');
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

/* ---------- Envoi de message ---------- */
function sendMessage(text) {
  if (!text.trim()) return;
  if (!messages[state.channel]) messages[state.channel] = [];

  messages[state.channel].push({
    author: state.username,
    text: text.trim(),
    t: Date.now(),
  });

  saveMessages(messages);
  renderMessages();

  /* BACKEND HOOK ---------------------------------------------------------
     Pour du vrai temps réel multi-utilisateurs, remplace saveMessages()
     par un appel à ton backend, par ex. avec Supabase Realtime :

     await supabase.from('messages').insert({
       channel: state.channel,
       author: state.username,
       text: text.trim(),
     });

     ...et écoute les nouveaux messages avec supabase
       .channel('messages')
       .on('postgres_changes', { event: 'INSERT', ... }, renderMessages)
       .subscribe();
  ------------------------------------------------------------------------- */
}

/* ---------- Utilitaires ---------- */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

function formatTime(t) {
  const d = new Date(t);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Aujourd'hui à ${time}` : `${d.toLocaleDateString('fr-FR')} ${time}`;
}

const PALETTE = ['#6C6FFF', '#3ED598', '#FF8A5C', '#FF5C7A', '#5CC8FF', '#C77CFF'];
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/* ---------- Panneaux mobiles ---------- */
const appEl = document.getElementById('app');
const overlay = document.getElementById('overlay');

function closeMobilePanels() {
  appEl.classList.remove('nav-open', 'members-open');
}

document.getElementById('openChannels').addEventListener('click', () => {
  appEl.classList.add('nav-open');
});
document.getElementById('closeChannels').addEventListener('click', closeMobilePanels);
document.getElementById('openMembers').addEventListener('click', () => {
  appEl.classList.add('members-open');
});
document.getElementById('closeMembers').addEventListener('click', closeMobilePanels);
overlay.addEventListener('click', closeMobilePanels);

/* ---------- Formulaire d'envoi ---------- */
document.getElementById('composerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('composerInput');
  sendMessage(input.value);
  input.value = '';
});

/* ---------- Synchro entre onglets (même navigateur) ---------- */
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    messages = loadMessages();
    renderMessages();
  }
});

/* ---------- Modale de pseudo ---------- */
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');

function applyUsername(name) {
  state.username = name;
  localStorage.setItem(NAME_KEY, name);
  document.getElementById('myName').textContent = name;
  document.getElementById('myAvatar').textContent = initials(name);
  document.getElementById('myAvatar').style.background = colorFor(name);
  nameModal.classList.add('is-hidden');
  renderMessages();
}

document.getElementById('nameConfirm').addEventListener('click', () => {
  const v = nameInput.value.trim();
  if (v) applyUsername(v);
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('nameConfirm').click();
});

/* ---------- Démarrage ---------- */
function init() {
  renderRail();
  renderChannels();
  renderDMs();
  renderMembers();
  selectChannel('general');

  if (state.username) {
    applyUsername(state.username);
  } else {
    nameModal.classList.remove('is-hidden');
    nameInput.focus();
  }
}

init();
