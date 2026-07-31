import React, { useMemo, useState } from "react";
import { money, statusLabel } from "../utils/format";

export default function Order({ table, orders, products, canOrder, onBack, onSend, onRequestClosing }) {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const current = orders.filter(o => o.table_id === table.id && !["closed","cancelled"].includes(o.status));
  const total = useMemo(() => cart.reduce((s,i) => s + i.price_cents * i.quantity, 0), [cart]);
  const shown = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  function add(p) {
    setCart(items => {
      const found = items.find(i => i.id === p.id);
      return found ? items.map(i => i.id === p.id ? {...i, quantity:i.quantity+1} : i) : [...items, {...p, quantity:1, note:""}];
    });
  }
  function change(id, delta) {
    setCart(items => items.map(i => i.id === id ? {...i, quantity:i.quantity+delta} : i).filter(i => i.quantity > 0));
  }
  async function send() {
    await onSend(table.id, cart.map(i => ({product_id:i.id, quantity:i.quantity, note:i.note || null})));
    setCart([]);
  }

  return <>
    <button className="button secondary" onClick={onBack}>← Mesas</button>
    <section className="card block">
      <h2>{table.name}</h2>
      <h3>Pedidos enviados</h3>
      {current.length ? current.map(o => <div className="line" key={o.id}>
        <div><strong>#{String(o.number).padStart(4,"0")} · {statusLabel(o.status)}</strong>
        <small>{o.order_items?.map(i => `${i.quantity}× ${i.product_name}${i.note ? ` (${i.note})` : ""}`).join(" · ")}</small></div>
        <strong>{money(o.total_cents)}</strong>
      </div>) : <p className="muted">Nenhum pedido enviado.</p>}
    </section>

    {canOrder && <>
      <section className="card block">
        <h3>Novo pedido</h3>
        {cart.length ? cart.map(i => <div className="line" key={i.id}>
          <div><strong>{i.quantity}× {i.name}</strong>
          <input className="input compact" placeholder="Observação" value={i.note}
            onChange={e => setCart(items => items.map(x => x.id === i.id ? {...x,note:e.target.value} : x))}/></div>
          <div className="row"><button className="button secondary" onClick={() => change(i.id,-1)}>−</button><button className="button secondary" onClick={() => change(i.id,1)}>+</button></div>
        </div>) : <p className="muted">Nenhum item adicionado.</p>}
        <div className="line total"><span>Total</span><strong>{money(total)}</strong></div>
        <button className="button full success" disabled={!cart.length} onClick={send}>Enviar para produção</button>
      </section>
      <input className="input" placeholder="Buscar produto" value={search} onChange={e => setSearch(e.target.value)}/>
      <section className="products">
        {shown.map(p => <article key={p.id} className="card product">
          <div><strong>{p.name}</strong><small>{p.category} · {money(p.price_cents)}</small></div>
          <button className="button" onClick={() => add(p)}>Adicionar</button>
        </article>)}
      </section>
    </>}

    {current.length > 0 && <button className="button full secondary closing" onClick={() => onRequestClosing(table.id)}>Solicitar fechamento</button>}
  </>;
}
