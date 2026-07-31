import React from "react";
import { money, minutesSince } from "../utils/format";

export default function Tables({ tables, orders, onOpen }) {
  const active = id => orders.filter(o => o.table_id === id && !["closed","cancelled"].includes(o.status));
  return <>
    <div className="sectionTitle"><h2>Mesas</h2></div>
    <section className="tables">
      {tables.map(t => {
        const os = active(t.id);
        const total = os.reduce((s,o) => s + o.total_cents, 0);
        const oldest = os[os.length - 1];
        const ready = os.some(o => o.status === "ready");
        const preparing = os.some(o => o.status === "preparing");
        const label = t.status === "free" ? "Livre" : ready ? "Pedido pronto" : preparing ? "Preparando" : t.status === "awaiting_payment" ? "Aguardando pagamento" : "Ocupada";
        return <button key={t.id} className="card table" onClick={() => onOpen(t.id)}>
          <strong>{t.name}</strong>
          <span className={`status ${t.status === "free" ? "free" : ready ? "ready" : preparing ? "preparing" : "occupied"}`}>{label}</span>
          <small>{money(total)} {oldest ? `· ${minutesSince(oldest.created_at)} min` : ""}</small>
        </button>;
      })}
    </section>
  </>;
}
