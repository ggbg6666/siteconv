import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/router";

function initials(name) {
  return (name || "?").slice(0, 2).toUpperCase();
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderText(text) {
  const parts = text.split(/(@[a-z0-9_]+)/gi);
  return parts.map((part, i) =>
    /^@[a-z0-9_]+$/i.test(part) ? (
      <span className="mention" key={i}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function Chat() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [friends, setFriends] = useState([]);
  const [active, setActive] = useState({ type: "channel", id: "general" });
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [addFriendInput, setAddFriendInput] = useState("");
  const [friendError, setFriendError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  // Auth check
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setMe(d.username))
      .catch(() => router.push("/"));
  }, [router]);

  const loadFriends = useCallback(() => {
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => setFriends(d.friends || []));
  }, []);

  useEffect(() => {
    if (me) loadFriends();
  }, [me, loadFriends]);

  const loadMessages = useCallback(() => {
    const q = active.type === "channel" ? `channel=${active.id}` : `with=${active.id}`;
    fetch(`/api/messages?${q}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []));
  }, [active]);

  useEffect(() => {
    if (!me) return;
    loadMessages();
    clearInterval(pollRef.current);
    pollRef.current = setInterval(loadMessages, 2500);
    return () => clearInterval(pollRef.current);
  }, [me, active, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    const body =
      active.type === "channel"
        ? { channel: active.id, text: draft }
        : { with: active.id, text: draft };
    setDraft("");
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    loadMessages();
  }

  async function addFriend(e) {
    e.preventDefault();
    setFriendError("");
    if (!addFriendInput.trim()) return;
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: addFriendInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFriendError(data.error || "Erreur.");
      return;
    }
    setAddFriendInput("");
    loadFriends();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
  }

  function selectChat(next) {
    setActive(next);
    setSidebarOpen(false);
  }

  if (!me) return null;

  return (
    <div className="app">
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">💬 Mon Chat</div>

        <div className="sidebar-section-title">Salons</div>
        <div
          className={`channel-item ${active.type === "channel" && active.id === "general" ? "active" : ""}`}
          onClick={() => selectChat({ type: "channel", id: "general" })}
        >
          # général
        </div>

        <div className="sidebar-section-title">Amis</div>
        {friends.length === 0 && (
          <div style={{ padding: "0 16px", fontSize: 13, color: "#6d6f78" }}>
            Ajoute un ami avec @pseudo ci-dessous.
          </div>
        )}
        {friends.map((f) => (
          <div
            key={f}
            className={`friend-item ${active.type === "dm" && active.id === f ? "active" : ""}`}
            onClick={() => selectChat({ type: "dm", id: f })}
          >
            <span className="avatar-dot" />@{f}
          </div>
        ))}

        <div style={{ flex: 1 }} />

        <div className="add-friend-box">
          {friendError && <div className="error-box" style={{ fontSize: 12 }}>{friendError}</div>}
          <form onSubmit={addFriend}>
            <input
              placeholder="@pseudo à ajouter"
              value={addFriendInput}
              onChange={(e) => setAddFriendInput(e.target.value)}
            />
            <button type="submit">Ajouter un ami</button>
          </form>
        </div>

        <div className="sidebar-footer">
          <span>@{me}</span>
          <button className="logout-btn" onClick={logout}>Déconnexion</button>
        </div>
      </div>

      <div className="main">
        <div className="main-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
          <span>{active.type === "channel" ? `# ${active.id}` : `@${active.id}`}</span>
        </div>

        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-hint">
              Aucun message pour l'instant (les messages disparaissent après 1h).
            </div>
          )}
          {messages.map((m, i) => (
            <div className="msg" key={i}>
              <div className="msg-avatar">{initials(m.from)}</div>
              <div className="msg-body">
                <div className="msg-head">
                  <span className="msg-author">@{m.from}</span>
                  <span className="msg-time">{formatTime(m.ts)}</span>
                </div>
                <div className="msg-text">{renderText(m.text)}</div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={sendMessage}>
            <input
              placeholder={
                active.type === "channel" ? "Écrire dans #général" : `Écrire à @${active.id}`
              }
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit">Envoyer</button>
          </form>
        </div>
      </div>
    </div>
  );
}
