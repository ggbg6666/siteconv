import { useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Une erreur est survenue.");
        setLoading(false);
        return;
      }
      router.push("/chat");
    } catch {
      setError("Impossible de contacter le serveur.");
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>{mode === "login" ? "Content de te revoir !" : "Créer un compte"}</h1>
        <p className="sub">
          {mode === "login"
            ? "On est content de te revoir."
            : "Juste un pseudo et un mot de passe, rien d'autre."}
        </p>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={submit}>
          <label className="field-label">Pseudo</label>
          <input
            className="field-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ex: leo_75"
            autoFocus
          />
          <label className="field-label">Mot de passe</label>
          <input
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "..." : mode === "login" ? "Se connecter" : "S'inscrire"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? (
            <>Pas de compte ? <a onClick={() => { setMode("register"); setError(""); }}>En créer un</a></>
          ) : (
            <>Déjà un compte ? <a onClick={() => { setMode("login"); setError(""); }}>Se connecter</a></>
          )}
        </div>
      </div>
    </div>
  );
}
