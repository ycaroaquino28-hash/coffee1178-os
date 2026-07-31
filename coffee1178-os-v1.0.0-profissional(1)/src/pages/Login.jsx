import React, { useState } from "react";

export default function Login({ onLogin, error }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await onLogin(pin); } finally { setBusy(false); }
  }
  return <main className="center">
    <section className="card login">
      <div className="brand">Coffee 1178 OS</div>
      <p>Acesso da equipe</p>
      {error && <div className="notice error">{error}</div>}
      <form onSubmit={submit}>
        <input className="input pin" type="password" inputMode="numeric" maxLength="8"
          value={pin} onChange={e => setPin(e.target.value)} placeholder="••••" required />
        <button className="button full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
    </section>
  </main>;
}
