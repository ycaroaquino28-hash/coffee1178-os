import React, { useState } from "react";
import { money } from "../utils/format";

export default function Payments({ tables, orders, onPay }) {
  const waiting = tables.filter(t => t.status === "awaiting_payment");
  return <>
    <h2>Caixa</h2>
    {waiting.map(t => {
      const total = orders.filter(o => o.table_id === t.id && !["closed","cancelled"].includes(o.status)).reduce((s,o)=>s+o.total_cents,0);
      return <PaymentCard key={t.id} table={t} total={total} onPay={onPay}/>;
    })}
    {!waiting.length && <div className="card empty">Nenhuma mesa aguardando pagamento.</div>}
  </>;
}
function PaymentCard({table,total,onPay}) {
  const [method,setMethod] = useState("pix");
  return <section className="card block">
    <div className="line"><strong>{table.name}</strong><strong>{money(total)}</strong></div>
    <select className="input" value={method} onChange={e=>setMethod(e.target.value)}>
      <option value="pix">Pix</option><option value="cash">Dinheiro</option>
      <option value="debit">Débito</option><option value="credit">Crédito</option>
      <option value="ton">Ton — confirmação manual</option>
    </select>
    <button className="button full success" onClick={()=>onPay(table.id,method)}>Confirmar pagamento</button>
  </section>;
}
