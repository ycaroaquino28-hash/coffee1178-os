import React from "react";
import { money } from "../utils/format";

export default function Reports({ payments, audit }) {
  const today = new Date().toISOString().slice(0,10);
  const todayPayments = payments.filter(p => p.created_at.startsWith(today));
  return <>
    <h2>Relatórios</h2>
    <section className="stats">
      <article className="card"><small>Vendas de hoje</small><strong>{money(todayPayments.reduce((s,p)=>s+p.amount_cents,0))}</strong></article>
      <article className="card"><small>Pagamentos hoje</small><strong>{todayPayments.length}</strong></article>
      <article className="card"><small>Total registrado</small><strong>{money(payments.reduce((s,p)=>s+p.amount_cents,0))}</strong></article>
    </section>
    <h3>Últimos pagamentos</h3>
    <section className="card">{payments.slice(0,30).map(p => <div className="audit" key={p.id}><strong>{money(p.amount_cents)} · {p.method}</strong><small>{new Date(p.created_at).toLocaleString("pt-BR")} · {p.confirmed_by_name}</small></div>)}</section>
    <h3>Auditoria</h3>
    <section className="card">{audit.slice(0,60).map(a => <div className="audit" key={a.id}><strong>{a.action.replaceAll("_"," ")}</strong><small>{new Date(a.created_at).toLocaleString("pt-BR")} · {a.actor_name}</small></div>)}</section>
  </>;
}
