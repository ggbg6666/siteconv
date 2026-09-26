/* ==========================================================================
   Signal Room — chat en temps réel, comptes réels via Supabase
   --------------------------------------------------------------------------
   Backend : Supabase (Postgres + Auth + Realtime), gratuit pour démarrer.
   Voir README.md pour la mise en place (création du projet, script SQL).
   ========================================================================== */

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CHANNELS = [
  { id: 'general', name: 'général', topic: 'Discussion générale' },
  { id: 'annonces', name: 'annonces', topic: "Les infos importantes de la communauté" },
  { id: 'aide', name: 'aide', topic: 'Pose tes questions ici' },
  { id: 'off-topic', name: 'off-topic', topic: 'Tout sauf le sujet principal' },
];

let state = {
  channel: 'general',
  user: null,          // { id, email, displayName }
  messageSub: null,     // abonnement realtime aux messages du canal courant
  presenceChannel: null,
};

/* =========================== ÉCRAN D'AUTHENTIFICATION =========================== */

let authMode = 'login'; // 'login' | 'signup'

const authScreen = document.getElementById('authScreen');
const appEl = document.getElementById('app');
const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');
const displayNameField = document.getElementById('displayNameField');
const authForm = document.getElementById('authForm');
const authSubmit = document.getElementById('authSubmit');
const authError = document.getElementById('authError');
const authHint = document.getElementById('authHint');

function setAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle('is-active', mode === 'login');
  tabSignup.classList.toggle('is-active', mode === 'signup');
  displayNameField.classList.toggle('is-hidden', mode === 'login');
  authSubmit.textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
  authError.textContent = '';
  authHint.textContent = '';
}
tabLogin.addEventListener('click', () => setAuthMode('login'));
tabSignup.addEventListener('click', () => setAuthMode('signup'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  authHint.textContent = '';
  authSubmit.disabled = true;

  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const displayName = document.getElementById('displayNameInput').value.trim();

  try {
    if (authMode === 'signup') {
      if (!displayName) throw new Error('Choisis un pseudo.');
      const { data, error } = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;

      if (data.session) {
        enterApp(data.user);
      } else {
        authHint.textContent = "Compte créé ! Vérifie ta boîte mail pour confirmer, puis connecte-toi.";
        setAuthMode('login');
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      enterApp(data.user);
    }
  } catch (err) {
    authError.textContent = translateAuthError(err.message);
  } finally {
    authSubmit.disabled = false;
  }
});

function translateAuthError(msg) {
  if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/User already registered/i.test(msg)) return 'Un compte existe déjà avec cet email.';
  if (/Password should be/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/Failed to fetch/i.test(msg)) return "Impossible de contacter le serveur — vérifie que config.js contient bien tes clés Supabase.";
  return msg;
}

/* =========================== ENTRÉE DANS L'APPLICATION =========================== */

async function enterApp(authUser) {
  state.user = {
    id: authUser.id,
    email: authUser.email,
    displayName: authUser.user_metadata?.display_name || authUser.email.split('@')[0],
  };

  authScreen.classList.add('is-hidden');
  appEl.classList.remove('is-hidden');

  document.getElementById('myName').textContent = state.user.displayName;
  document.getElementById('myAvatar').textContent = initials(state.user.displayName);
  document.getElementById('myAvatar').style.background = colorFor(state.user.displayName);

  renderChannels();
  await selectChannel('general');
  setupPresence();
}

document.getElementById('settingsBtn').addEventListener('click', async () => {
  if (confirm('Se déconnecter ?')) {
    await supabaseClient.auth.signOut();
    location.reload();
  }
});

/* Reprend la session si l'utilisateur est déjà connecté (recharge de page) */
(async function checkExistingSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    enterApp(data.session.user);
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

async function selectChannel(id) {
  state.channel = id;
  const c = CHANNELS.find(ch => ch.id === id);
  document.getElementById('channelName').textContent = c.name;
  document.getElementById('channelTopic').textContent = c.topic;
  document.getElementById('composerInput').placeholder = `Écrire dans #${c.name}`;
  renderChannels();
  closeMobilePanels();

  await loadMessages(id);
  subscribeToChannel(id);
}

/* =========================== MESSAGES (chargement + envoi + temps réel) =========================== */

async function loadMessages(channelId) {
  const el = document.getElementById('messages');
  el.innerHTML = '<p style="color:var(--text-muted); padding:20px; font-size:13.5px;">Chargement des messages…</p>';

  const { data, error } = await supabaseClient
    .from('messages')
    .select('*')
    .eq('channel', channelId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    el.innerHTML = `<p style="color:var(--danger); padding:20px; font-size:13.5px;">Impossible de charger les messages : ${escapeHtml(error.message)}. Vérifie ta configuration Supabase (voir README.md).</p>`;
    return;
  }

  el.innerHTML = '';
  (data || []).forEach(m => appendMessageToDOM(m));
  el.scrollTop = el.scrollHeight;
}

function subscribeToChannel(channelId) {
  if (state.messageSub) {
    supabaseClient.removeChannel(state.messageSub);
  }
  state.messageSub = supabaseClient
    .channel('messages-' + channelId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `channel=eq.${channelId}`,
    }, (payload) => {
      appendMessageToDOM(payload.new);
      const el = document.getElementById('messages');
      el.scrollTop = el.scrollHeight;
    })
    .subscribe();
}

document.getElementById('composerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('composerInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const { error } = await supabaseClient.from('messages').insert({
    channel: state.channel,
    author: state.user.displayName,
    text,
    user_id: state.user.id,
  });

  if (error) {
    alert("Le message n'a pas pu être envoyé : " + error.message);
  }
});

let lastRenderedAuthor = null;
let lastRenderedTime = 0;

function appendMessageToDOM(m) {
  const el = document.getElementById('messages');
  const t = new Date(m.created_at).getTime();
  const sameGroup = m.author === lastRenderedAuthor && (t - lastRenderedTime) < 1000 * 60 * 4;

  if (sameGroup) {
    const group = document.createElement('div');
    group.className = 'msg-group';
    group.innerHTML = `
      <span class="msg__time-hover">${formatTime(t)}</span>
      <div class="msg__text">${escapeHtml(m.text)}</div>
    `;
    el.appendChild(group);
  } else {
    const msg = document.createElement('div');
    msg.className = 'msg' + (m.author === state.user.displayName ? ' is-me' : '');
    msg.innerHTML = `
      <div class="msg__avatar" style="background:${colorFor(m.author)}">${initials(m.author)}</div>
      <div class="msg__body">
        <div class="msg__meta">
          <span class="msg__author">${escapeHtml(m.author)}</span>
          <span class="msg__time">${formatTime(t)}</span>
        </div>
        <div class="msg__text">${escapeHtml(m.text)}</div>
      </div>
    `;
    el.appendChild(msg);
  }
  lastRenderedAuthor = m.author;
  lastRenderedTime = t;
}

/* =========================== PRÉSENCE (qui est en ligne) =========================== */

function setupPresence() {
  state.presenceChannel = supabaseClient.channel('online-users', {
    config: { presence: { key: state.user.id } },
  });

  state.presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const presentState = state.presenceChannel.presenceState();
      const names = Object.values(presentState).map(entries => entries[0].display_name);
      renderMembers(names);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await state.presenceChannel.track({ display_name: state.user.displayName });
      }
    });
}

function renderMembers(onlineNames) {
  const el = document.getElementById('membersList');
  el.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'channels__label';
  label.textContent = `En ligne — ${onlineNames.length}`;
  el.appendChild(label);

  onlineNames.forEach(name => {
    const div = document.createElement('div');
    div.className = 'member';
    div.innerHTML = `<span class="member__avatar">${initials(name)}</span><span class="member__name">${escapeHtml(name)}</span>`;
    el.appendChild(div);
  });
}

/* =========================== UTILITAIRES =========================== */

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

/* =========================== PANNEAUX MOBILES =========================== */

const overlay = document.getElementById('overlay');
function closeMobilePanels() { appEl.classList.remove('nav-open', 'members-open'); }

document.getElementById('openChannels').addEventListener('click', () => appEl.classList.add('nav-open'));
document.getElementById('closeChannels').addEventListener('click', closeMobilePanels);
document.getElementById('openMembers').addEventListener('click', () => appEl.classList.add('members-open'));
document.getElementById('closeMembers').addEventListener('click', closeMobilePanels);
overlay.addEventListener('click', closeMobilePanels);
