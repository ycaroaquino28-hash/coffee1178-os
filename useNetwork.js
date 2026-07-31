import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./services/supabase";
import { getQueue, getSnapshot, queueAction, removeQueued, saveSnapshot } from "./services/offlineQueue";
import { useNetwork } from "./hooks/useNetwork";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Tables from "./pages/Tables";
import Order from "./pages/Order";
import Kitchen from "./pages/Kitchen";
import Payments from "./pages/Payments";
import Reports from "./pages/Reports";
import { roleLabel } from "./utils/format";

export default function App() {
  const online = useNetwork();
  const [operator,setOperator] = useState(null);
  const [screen,setScreen] = useState("tables");
  const [activeTable,setActiveTable] = useState(null);
  const [data,setData] = useState({tables:[],orders:[],products:[],payments:[],audit:[]});
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);

  async function ensureAuth() {
    const {data:{session}} = await supabase.auth.getSession();
    if (!session) {
      const {error} = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }
  }

  async function loadAll() {
    const requests = [
      supabase.from("cafe_tables").select("*").order("number"),
      supabase.from("orders").select("*,order_items(*)").order("created_at",{ascending:false}).limit(300),
      supabase.from("products").select("*").eq("active",true).order("category").order("name")
    ];
    if (operator?.role === "admin" || operator?.role === "cashier" || operator?.role === "kitchen")
      requests.push(supabase.from("payments").select("*").order("created_at",{ascending:false}).limit(300));
    else requests.push(Promise.resolve({data:[],error:null}));
    if (operator?.role === "admin")
      requests.push(supabase.from("audit_log").select("*").order("created_at",{ascending:false}).limit(200));
    else requests.push(Promise.resolve({data:[],error:null}));

    const [t,o,p,pay,a] = await Promise.all(requests);
    for (const r of [t,o,p,pay,a]) if (r.error) throw r.error;
    const next = {tables:t.data||[],orders:o.data||[],products:p.data||[],payments:pay.data||[],audit:a.data||[]};
    setData(next); saveSnapshot(next);
  }

  async function flushQueue() {
    for (const action of getQueue()) {
      let result;
      if (action.type === "create_order") result = await supabase.rpc("create_order", action.payload);
      if (action.type === "request_closing") result = await supabase.rpc("request_table_closing", action.payload);
      if (result && !result.error) removeQueued(action.id);
    }
  }

  useEffect(() => {
    (async()=>{
      try {
        await ensureAuth();
        const {data,error} = await supabase.rpc("current_operator");
        if (error) throw error;
        if (data?.length) setOperator(data[0]);
        else {
          const snapshot = getSnapshot();
          if (snapshot) setData(snapshot);
        }
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!operator) return;
    loadAll().catch(e => {
      const snapshot = getSnapshot();
      if (snapshot) setData(snapshot);
      setError(e.message);
    });
  }, [operator]);

  useEffect(() => {
    if (!operator || !online) return;
    flushQueue().then(loadAll).catch(console.warn);
    const channel = supabase.channel("coffee1178-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"cafe_tables"},loadAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},loadAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"order_items"},loadAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"payments"},loadAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [operator,online]);

  async function login(pin) {
    setError("");
    const {data,error} = await supabase.rpc("verify_operator_pin",{p_pin:pin});
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("PIN inválido ou usuário inativo.");
    setOperator(data[0]);
  }

  async function logout() {
    if (online) await supabase.rpc("operator_logout");
    setOperator(null); setScreen("tables"); setActiveTable(null);
  }

  async function sendOrder(tableId,items) {
    const payload = {p_table_id:tableId,p_items:items};
    if (!online) {
      queueAction({type:"create_order",payload});
      alert("Pedido guardado no aparelho. Ele será enviado quando a internet voltar.");
      return;
    }
    const {error} = await supabase.rpc("create_order",payload);
    if (error) throw new Error(error.message);
    await loadAll();
  }

  async function requestClosing(tableId) {
    const payload = {p_table_id:tableId};
    if (!online) {
      queueAction({type:"request_closing",payload});
      alert("Solicitação guardada. Será sincronizada quando a internet voltar.");
      return;
    }
    const {error}=await supabase.rpc("request_table_closing",payload);
    if(error) throw new Error(error.message);
    setActiveTable(null); await loadAll();
  }

  async function setOrderStatus(id,status) {
    const {error}=await supabase.rpc("set_order_status",{p_order_id:id,p_status:status});
    if(error) throw new Error(error.message); await loadAll();
  }
  async function cancelOrder(id) {
    if(!confirm("Cancelar este pedido?")) return;
    const {error}=await supabase.rpc("cancel_order",{p_order_id:id});
    if(error) throw new Error(error.message); await loadAll();
  }
  async function pay(tableId,method) {
    if(!confirm("Confirmar pagamento e liberar a mesa?")) return;
    const {error}=await supabase.rpc("close_table_with_payment",{p_table_id:tableId,p_method:method});
    if(error) throw new Error(error.message); await loadAll();
  }

  if (loading) return <main className="center"><div className="brand">Coffee 1178 OS</div></main>;
  if (!operator) return <Login onLogin={login} error={error}/>;

  const table = data.tables.find(t => t.id === activeTable);
  const canKitchen = ["admin","kitchen"].includes(operator.role);
  const canPayments = ["admin","cashier","kitchen"].includes(operator.role);
  const canReports = operator.role === "admin";

  const nav = <nav className="nav">
    <button className={`button ${screen==="tables"?"success":"secondary"}`} onClick={()=>{setScreen("tables");setActiveTable(null)}}>Mesas</button>
    {canKitchen && <button className={`button ${screen==="kitchen"?"success":"secondary"}`} onClick={()=>{setScreen("kitchen");setActiveTable(null)}}>Cozinha</button>}
    {canPayments && <button className={`button ${screen==="payments"?"success":"secondary"}`} onClick={()=>{setScreen("payments");setActiveTable(null)}}>Caixa</button>}
    {canReports && <button className={`button ${screen==="reports"?"success":"secondary"}`} onClick={()=>{setScreen("reports");setActiveTable(null)}}>Relatórios</button>}
    <button className="button secondary" onClick={logout}>Sair</button>
  </nav>;

  let content;
  if (table) content = <Order table={table} orders={data.orders} products={data.products}
      canOrder={["admin","waiter"].includes(operator.role)}
      onBack={()=>setActiveTable(null)} onSend={sendOrder} onRequestClosing={requestClosing}/>;
  else if (screen==="kitchen") content = <Kitchen orders={data.orders} tables={data.tables} onStatus={setOrderStatus} onCancel={cancelOrder}/>;
  else if (screen==="payments") content = <Payments tables={data.tables} orders={data.orders} onPay={pay}/>;
  else if (screen==="reports") content = <Reports payments={data.payments} audit={data.audit}/>;
  else content = <Tables tables={data.tables} orders={data.orders} onOpen={setActiveTable}/>;

  return <Layout title="Coffee 1178 OS" subtitle={`${operator.name} · ${roleLabel(operator.role)}`} online={online} nav={nav}>
    {error && <div className="notice error">{error}</div>}
    {getQueue().length > 0 && <div className="notice">Há {getQueue().length} ação(ões) aguardando sincronização.</div>}
    {content}
  </Layout>;
}
