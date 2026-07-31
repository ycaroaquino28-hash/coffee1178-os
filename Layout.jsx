import React, { useState } from "react";
import { money, minutesSince, statusLabel } from "../utils/format";

export default function Kitchen({ orders, tables, onStatus, onCancel }) {
  const [filter, setFilter] = useState("sent");
  const shown = orders.filter(o => o.status === filter);
  const next = {sent:"preparing",preparing:"ready",ready:"delivered"};
  return <>
    <div className="tabs">
      {["sent","preparing","ready","delivered"].map(s =>
        <button key={s} className={`button ${filter===s ? "success" : "secondary"}`} onClick={() => setFilter(s)}>{statusLabel(s)}</button>)}
    </div>
    <section className="products">
      {shown.map(o => {
        const table = tables.find(t => t.id === o.table_id);
        return <article className="card block" key={o.id}>
          <div className="line"><div><h3>{table?.name}</h3><small>#{String(o.number).padStart(4,"0")} · {o.created_by_name} · {minutesSince(o.created_at)} min</small></div><strong>{money(o.total_cents)}</strong></div>
          <p>{o.order_items?.map(i => `${i.quantity}× ${i.product_name}${i.note ? ` — ${i.note}` : ""}`).join(" | ")}</p>
          <div className="row">
            {next[o.status] && <button className="button success" onClick={() => onStatus(o.id,next[o.status])}>{statusLabel(next[o.status])}</button>}
            {o.status === "sent" && <button className="button danger" onClick={() => onCancel(o.id)}>Cancelar</button>}
          </div>
        </article>;
      })}
      {!shown.length && <div className="card empty">Nenhum pedido nesta etapa.</div>}
    </section>
  </>;
}
