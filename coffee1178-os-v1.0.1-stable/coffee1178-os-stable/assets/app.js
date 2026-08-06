import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const root = document.querySelector("#app");
const cfg = window.COFFEE1178_CONFIG || {};
const STORAGE = {
  operator: "coffee1178.operator",
  snapshot: "coffee1178.snapshot",
  queue: "coffee1178.queue"
};

let supabase;
let operator = null;
let data = {tables:[],orders:[],products:[],payments:[],audit:[]};
let screen = "tables";
let activeTable = null;
let cart = [];
let message = "";
let realtime = null;
let kitchenFilter = "sent";

const money = cents => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((cents||0)/100);
const minutes = iso => Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/60000));
const roleLabel = r => ({admin:"Administrador",waiter:"Garçom",kitchen:"Cozinha",cashier:"Caixa"})[r] || r;
const statusLabel = s => ({sent:"Novo",preparing:"Preparando",ready:"Pronto",delivered:"Entregue",closed:"Fechado",cancelled:"Cancelado"})[s] || s;
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const online = () => navigator.onLine;

function saveSnapshot(){ localStorage.setItem(STORAGE.snapshot, JSON.stringify(data)); }
function loadSnapshot(){
  try { const s=JSON.parse(localStorage.getItem(STORAGE.snapshot)||"null"); if(s) data=s; } catch {}
}
function getQueue(){ try{return JSON.parse(localStorage.getItem(STORAGE.queue)||"[]")}catch{return []} }
function setQueue(q){ localStorage.setItem(STORAGE.queue,JSON.stringify(q)); }
function queue(type,payload){ const q=getQueue();q.push({id:crypto.randomUUID(),type,payload});setQueue(q); }
function show(text){ message=text; render(); setTimeout(()=>{message="";render()},2400); }

function layout(content){
  const pending=getQueue().length;
  return `<div class="app">
    <header class="topbar">
      <div><h1>Coffee 1178 OS</h1><small>${operator?`${esc(operator.name)} · ${roleLabel(operator.role)}`:"Sistema de comandas"}</small></div>
      <span class="connection ${online()?"online":"offline"}">${online()?"Online":"Offline"}</span>
    </header>
    <main class="content">
      ${message?`<div class="notice ok">${esc(message)}</div>`:""}
      ${pending?`<div class="notice">${pending} ação(ões) aguardando sincronização.</div>`:""}
      ${content}
    </main>
    ${operator?nav():""}
  </div>`;
}
function nav(){
  const k=["admin","kitchen"].includes(operator.role);
  const p=["admin","cashier","kitchen"].includes(operator.role);
  const r=operator.role==="admin";
  return `<nav class="nav">
    <button class="button ${screen==="tables"?"success":"secondary"}" data-nav="tables">Mesas</button>
    ${k?`<button class="button ${screen==="kitchen"?"success":"secondary"}" data-nav="kitchen">Cozinha</button>`:""}
    ${p?`<button class="button ${screen==="payments"?"success":"secondary"}" data-nav="payments">Caixa</button>`:""}
    ${r?`<button class="button ${screen==="reports"?"success":"secondary"}" data-nav="reports">Relatórios</button>`:""}
    <button class="button secondary" id="logout">Sair</button>
  </nav>`;
}
function bindNav(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{screen=b.dataset.nav;activeTable=null;render()});
  const logout=document.querySelector("#logout");
  if(logout) logout.onclick=doLogout;
}

async function ensureSession(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){
    const {error}=await supabase.auth.signInAnonymously();
    if(error) throw error;
  }
}
async function loadAll(){
  if(!online()){ loadSnapshot(); return; }
  const req=[
    supabase.from("cafe_tables").select("*").order("number"),
    supabase.from("orders").select("*,order_items(*)").order("created_at",{ascending:false}).limit(300),
    supabase.from("products").select("*").eq("active",true).order("category").order("name")
  ];
  const canPay=["admin","cashier","kitchen"].includes(operator?.role);
  req.push(canPay?supabase.from("payments").select("*").order("created_at",{ascending:false}).limit(300):Promise.resolve({data:[],error:null}));
  req.push(operator?.role==="admin"?supabase.from("audit_log").select("*").order("created_at",{ascending:false}).limit(200):Promise.resolve({data:[],error:null}));
  const [t,o,p,pay,a]=await Promise.all(req);
  for(const x of [t,o,p,pay,a]) if(x.error) throw x.error;
  data={tables:t.data||[],orders:o.data||[],products:p.data||[],payments:pay.data||[],audit:a.data||[]};
  saveSnapshot();
}
async function flushQueue(){
  if(!online()||!operator) return;
  const pending=getQueue(), keep=[];
  for(const item of pending){
    let res;
    if(item.type==="create_order") res=await supabase.rpc("create_order",item.payload);
    if(item.type==="request_closing") res=await supabase.rpc("request_table_closing",item.payload);
    if(res?.error) keep.push(item);
  }
  setQueue(keep);
}
function subscribe(){
  if(realtime) supabase.removeChannel(realtime);
  realtime=supabase.channel("coffee1178-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"cafe_tables"},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"orders"},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"order_items"},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"payments"},refresh)
    .subscribe();
}
let refreshTimer;
function refresh(){ clearTimeout(refreshTimer); refreshTimer=setTimeout(async()=>{try{await loadAll();render()}catch(e){console.error(e)}},180); }

function renderLogin(error=""){
  root.innerHTML=`<main class="center"><section class="card login">
    <div class="brand">Coffee 1178 OS</div><p>Acesso da equipe</p>
    ${error?`<div class="notice error">${esc(error)}</div>`:""}
    <form id="login"><input id="pin" class="input pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" required>
    <button class="button full">Entrar</button></form>
  </section></main>`;
  document.querySelector("#login").onsubmit=async e=>{
    e.preventDefault();
    if(!online()){ renderLogin("O primeiro login neste aparelho precisa de internet."); return; }
    const pin=document.querySelector("#pin").value;
    const {data:op,error}=await supabase.rpc("verify_operator_pin",{p_pin:pin});
    if(error||!op?.length){ renderLogin(error?.message||"PIN inválido."); return; }
    operator=op[0];
    localStorage.setItem(STORAGE.operator,JSON.stringify(operator));
    await loadAll(); subscribe(); render();
  };
}
function openOrders(id){return data.orders.filter(o=>o.table_id===id&&!["closed","cancelled"].includes(o.status))}
function renderTables(){
  root.innerHTML=layout(`<h2>Mesas</h2><section class="tables">${
    data.tables.map(t=>{
      const os=openOrders(t.id), total=os.reduce((s,o)=>s+o.total_cents,0);
      const ready=os.some(o=>o.status==="ready"), preparing=os.some(o=>o.status==="preparing");
      const label=t.status==="free"?"Livre":ready?"Pedido pronto":preparing?"Preparando":t.status==="awaiting_payment"?"Aguardando pagamento":"Ocupada";
      const cls=t.status==="free"?"free":ready?"ready":preparing?"preparing":"occupied";
      const oldest=os[os.length-1];
      return `<button class="card table" data-table="${t.id}"><strong>${esc(t.name)}</strong><span class="status ${cls}">${label}</span><small>${money(total)}${oldest?` · ${minutes(oldest.created_at)} min`:""}</small></button>`;
    }).join("")
  }</section>`);
  bindNav();
  document.querySelectorAll("[data-table]").forEach(b=>b.onclick=()=>{activeTable=b.dataset.table;cart=[];render()});
}
function renderOrder(){
  const table=data.tables.find(t=>t.id===activeTable);
  const current=openOrders(table.id);
  const canOrder=["admin","waiter"].includes(operator.role);
  const total=cart.reduce((s,i)=>s+i.price_cents*i.quantity,0);
  root.innerHTML=layout(`<button class="button secondary" id="back">← Mesas</button>
    <section class="card block"><h2>${esc(table.name)}</h2><h3>Pedidos enviados</h3>
      ${current.length?current.map(o=>`<div class="line"><div><strong>#${String(o.number).padStart(4,"0")} · ${statusLabel(o.status)}</strong><small>${(o.order_items||[]).map(i=>`${i.quantity}× ${esc(i.product_name)}${i.note?` (${esc(i.note)})`:""}`).join(" · ")}</small></div><strong>${money(o.total_cents)}</strong></div>`).join(""):`<p class="muted">Nenhum pedido enviado.</p>`}
    </section>
    ${canOrder?`<section class="card block"><h3>Novo pedido</h3>
      ${cart.length?cart.map(i=>`<div class="line"><div><strong>${i.quantity}× ${esc(i.name)}</strong><input class="input compact" data-note="${i.id}" value="${esc(i.note||"")}" placeholder="Observação"></div><div class="row"><button class="button secondary" data-minus="${i.id}">−</button><button class="button secondary" data-plus="${i.id}">+</button></div></div>`).join(""):`<p class="muted">Nenhum item adicionado.</p>`}
      <div class="line total"><span>Total</span><strong>${money(total)}</strong></div>
      <button class="button full success" id="send" ${cart.length?"":"disabled"}>Enviar para produção</button>
    </section>
    <input class="input" id="search" placeholder="Buscar produto">
    <section class="products" id="products">${productCards(data.products)}</section>`:""}
    ${current.length?`<button class="button full secondary" id="closing">Solicitar fechamento</button>`:""}`);
  bindNav();
  document.querySelector("#back").onclick=()=>{activeTable=null;render()};
  bindCart();
  const search=document.querySelector("#search");
  if(search) search.oninput=()=>{document.querySelector("#products").innerHTML=productCards(data.products.filter(p=>p.name.toLowerCase().includes(search.value.toLowerCase())));bindAdd()};
  const send=document.querySelector("#send"); if(send) send.onclick=sendOrder;
  const close=document.querySelector("#closing"); if(close) close.onclick=requestClosing;
}
function productCards(items){return items.map(p=>`<article class="card product"><div><strong>${esc(p.name)}</strong><small>${esc(p.category)} · ${money(p.price_cents)}</small></div><button class="button" data-add="${p.id}">Adicionar</button></article>`).join("")}
function bindAdd(){document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{const p=data.products.find(x=>x.id===b.dataset.add),found=cart.find(x=>x.id===p.id);found?found.quantity++:cart.push({...p,quantity:1,note:""});render()})}
function bindCart(){
  bindAdd();
  document.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>{const i=cart.find(x=>x.id===b.dataset.minus);i.quantity--;cart=cart.filter(x=>x.quantity>0);render()});
  document.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>{cart.find(x=>x.id===b.dataset.plus).quantity++;render()});
  document.querySelectorAll("[data-note]").forEach(i=>i.oninput=()=>{cart.find(x=>x.id===i.dataset.note).note=i.value});
}
async function sendOrder(){
  const payload={p_table_id:activeTable,p_items:cart.map(i=>({product_id:i.id,quantity:i.quantity,note:i.note||null}))};
  if(!online()){queue("create_order",payload);cart=[];show("Pedido guardado; será enviado quando a internet voltar.");return}
  const {error}=await supabase.rpc("create_order",payload);if(error){alert(error.message);return}cart=[];await loadAll();render();
}
async function requestClosing(){
  const payload={p_table_id:activeTable};
  if(!online()){queue("request_closing",payload);activeTable=null;show("Fechamento guardado para sincronizar.");return}
  const {error}=await supabase.rpc("request_table_closing",payload);if(error){alert(error.message);return}activeTable=null;await loadAll();render();
}
function renderKitchen(){
  const shown=data.orders.filter(o=>o.status===kitchenFilter);
  root.innerHTML=layout(`<div class="tabs">${["sent","preparing","ready","delivered"].map(s=>`<button class="button ${s===kitchenFilter?"success":"secondary"}" data-filter="${s}">${statusLabel(s)}</button>`).join("")}</div>
    <section class="products">${shown.map(o=>{const t=data.tables.find(x=>x.id===o.table_id);return `<article class="card block"><div class="line"><div><h3>${esc(t?.name||"Mesa")}</h3><small>#${String(o.number).padStart(4,"0")} · ${esc(o.created_by_name)} · ${minutes(o.created_at)} min</small></div><strong>${money(o.total_cents)}</strong></div><p>${(o.order_items||[]).map(i=>`${i.quantity}× ${esc(i.product_name)}${i.note?` — ${esc(i.note)}`:""}`).join(" | ")}</p><div class="row">${nextButton(o)}</div></article>`}).join("")||`<div class="card empty">Nenhum pedido nesta etapa.</div>`}</section>`);
  bindNav();
  document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{kitchenFilter=b.dataset.filter;render()});
  document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>setStatus(b.dataset.id,b.dataset.status));
  document.querySelectorAll("[data-cancel]").forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancel));
}
function nextButton(o){
  const next={sent:"preparing",preparing:"ready",ready:"delivered"}[o.status];
  return `${next?`<button class="button success" data-status="${next}" data-id="${o.id}">${statusLabel(next)}</button>`:""}${o.status==="sent"&&operator.role==="admin"?`<button class="button danger" data-cancel="${o.id}">Cancelar</button>`:""}`;
}
async function setStatus(id,status){
  if(!online()){alert("Alterações da cozinha exigem internet.");return}
  const {error}=await supabase.rpc("set_order_status",{p_order_id:id,p_status:status});if(error)alert(error.message);else{await loadAll();render()}
}
async function cancelOrder(id){
  if(!confirm("Cancelar este pedido?"))return;
  const {error}=await supabase.rpc("cancel_order",{p_order_id:id});if(error)alert(error.message);else{await loadAll();render()}
}
function renderPayments(){
  const waiting=data.tables.filter(t=>t.status==="awaiting_payment");
  root.innerHTML=layout(`<h2>Caixa</h2>${waiting.map(t=>{const total=openOrders(t.id).reduce((s,o)=>s+o.total_cents,0);return `<section class="card block"><div class="line"><strong>${esc(t.name)}</strong><strong>${money(total)}</strong></div><select class="input" id="method-${t.id}"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option><option value="credit">Crédito</option><option value="ton">Ton — confirmação manual</option></select><button class="button full success" data-pay="${t.id}">Confirmar pagamento</button></section>`}).join("")||`<div class="card empty">Nenhuma mesa aguardando pagamento.</div>`}`);
  bindNav();
  document.querySelectorAll("[data-pay]").forEach(b=>b.onclick=()=>pay(b.dataset.pay,document.querySelector(`#method-${CSS.escape(b.dataset.pay)}`).value));
}
async function pay(tableId,method){
  if(!online()){alert("Pagamentos exigem internet.");return}
  if(!confirm("Confirmar pagamento e liberar a mesa?"))return;
  const {error}=await supabase.rpc("close_table_with_payment",{p_table_id:tableId,p_method:method});if(error)alert(error.message);else{await loadAll();render()}
}
function renderReports(){
  const today=new Date().toISOString().slice(0,10),tp=data.payments.filter(p=>p.created_at.startsWith(today));
  root.innerHTML=layout(`<h2>Relatórios</h2><section class="stats"><article class="card"><small>Vendas de hoje</small><strong>${money(tp.reduce((s,p)=>s+p.amount_cents,0))}</strong></article><article class="card"><small>Pagamentos hoje</small><strong>${tp.length}</strong></article><article class="card"><small>Total registrado</small><strong>${money(data.payments.reduce((s,p)=>s+p.amount_cents,0))}</strong></article></section><h3>Últimos pagamentos</h3><section class="card">${data.payments.slice(0,30).map(p=>`<div class="audit"><strong>${money(p.amount_cents)} · ${esc(p.method)}</strong><small>${new Date(p.created_at).toLocaleString("pt-BR")} · ${esc(p.confirmed_by_name)}</small></div>`).join("")}</section><h3>Auditoria</h3><section class="card">${data.audit.slice(0,60).map(a=>`<div class="audit"><strong>${esc(a.action.replaceAll("_"," "))}</strong><small>${new Date(a.created_at).toLocaleString("pt-BR")} · ${esc(a.actor_name)}</small></div>`).join("")}</section>`);
  bindNav();
}
function renderProducts(){
  const products=[...data.products].sort((a,b)=>
    a.category.localeCompare(b.category,"pt-BR") ||
    a.name.localeCompare(b.name,"pt-BR")
  );

  root.innerHTML=layout(`
    <h2>Produtos</h2>
    <section class="card block">
      <strong>Edição de produtos</strong>
      <p><small>Altere os dados e clique em Salvar alterações.</small></p>
    </section>

    ${products.map(p=>`
      <section class="card block">
        <label>Nome</label>
        <input
          class="input"
          id="product-name-${p.id}"
          value="${esc(p.name)}"
        >

        <label>Categoria</label>
        <input
          class="input"
          id="product-category-${p.id}"
          value="${esc(p.category)}"
        >

        <label>Preço em reais</label>
        <input
          class="input"
          id="product-price-${p.id}"
          inputmode="decimal"
          value="${(p.price_cents/100).toFixed(2).replace(".",",")}"
        >

        <label class="line">
          <input
            type="checkbox"
            id="product-active-${p.id}"
            ${p.active?"checked":""}
          >
          Produto ativo
        </label>

        <button
          class="button success"
          data-save-product="${p.id}"
        >
          Salvar alterações
        </button>
      </section>
    `).join("")}
  `);

  bindNav();

  document.querySelectorAll("[data-save-product]").forEach(button=>{
    button.onclick=()=>saveProduct(button.dataset.saveProduct);
  });
}

async function saveProduct(id){
  if(!online()){
    alert("Alterações de produtos exigem internet.");
    return;
  }

  const name=document
    .getElementById(`product-name-${id}`)
    .value
    .trim();

  const category=document
    .getElementById(`product-category-${id}`)
    .value
    .trim();

  const priceText=document
    .getElementById(`product-price-${id}`)
    .value
    .trim()
    .replace(",", ".");

  const priceCents=Math.round(Number(priceText)*100);

  const active=document
    .getElementById(`product-active-${id}`)
    .checked;

  if(!name || !category || !Number.isFinite(priceCents) || priceCents<0){
    alert("Confira o nome, a categoria e o preço.");
    return;
  }

  const {error}=await supabase.rpc("admin_update_product",{
    p_product_id:id,
    p_name:name,
    p_category:category,
    p_price_cents:priceCents,
    p_active:active
  });

  if(error){
    alert(error.message);
    return;
  }

  await loadAll();
  alert("Produto atualizado com sucesso.");
  render();
}

function render(){
  if(!operator){renderLogin();return}
  if(activeTable){renderOrder();return}
  if(screen==="kitchen")renderKitchen();
  else if(screen==="payments")renderPayments();
  else if(screen==="reports")renderReports();
  else if(screen==="products")renderProducts();
  else renderTables();
}
async function doLogout(){
  if(online()) await supabase.rpc("operator_logout");
  localStorage.removeItem(STORAGE.operator);operator=null;screen="tables";activeTable=null;
  if(realtime) supabase.removeChannel(realtime);
  renderLogin();
}
async function boot(){
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
  addEventListener("online",async()=>{try{await ensureSession();await flushQueue();await loadAll();subscribe();render()}catch(e){console.error(e)}});
  addEventListener("offline",()=>{loadSnapshot();render()});
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_KEY){root.innerHTML=`<main class="center"><section class="card login"><div class="brand">Configuração ausente</div><p>O Netlify não gerou config.js. Verifique as duas variáveis de ambiente.</p></section></main>`;return}
  supabase=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  try{
    if(online()){
      await ensureSession();
      const {data:op,error}=await supabase.rpc("current_operator");
      if(error) throw error;
      if(op?.length){operator=op[0];localStorage.setItem(STORAGE.operator,JSON.stringify(operator));await loadAll();await flushQueue();subscribe();render();return}
    }
    loadSnapshot();
    operator=JSON.parse(localStorage.getItem(STORAGE.operator)||"null");
    operator?render():renderLogin();
  }catch(e){
    loadSnapshot();
    operator=JSON.parse(localStorage.getItem(STORAGE.operator)||"null");
    operator?render():renderLogin(e.message);
  }
}
boot();
