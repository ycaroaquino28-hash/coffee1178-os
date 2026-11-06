import {menus,photoFileMap} from './customer-menu.mjs?v=products-20261106-02';
import {availability,buildItems,OrderSender,money,escapeHtml as esc,statusLabel,MAX_UNITS,MAX_LINES,MAX_QUANTITY,MAX_NOTE} from './customer-core.mjs';
const $=id=>document.getElementById(id);
const ui=Object.fromEntries(['cafeTab','houseTab','title','hint','products','count','cartItems','cartTotal','cartBtn','closeCart','overlay','sendOrder','sendMessage','customerMessage','tableLabel','connectionNote','orderStatus','newVisit'].map(id=>[id,$(id)]));
let active='cafe',cart={},catalog=[],connected=false,sender=null,client=null,orders=[],statusTimer,refreshing=false;
let lastFocus;
const msg=text=>{ui.customerMessage.textContent=text;};
const cartCount=()=>Object.values(cart).reduce((sum,item)=>sum+item.quantity,0);
const visualById=id=>Object.values(menus).flat().find(p=>p.productId===id);
function render(){
 document.body.classList.toggle('house',active==='house');
 document.querySelector('meta[name="theme-color"]').content=active==='house'?'#241914':'#F1E8D8';
 ui.cafeTab.classList.toggle('active',active==='cafe');ui.houseTab.classList.toggle('active',active==='house');
 ui.cafeTab.setAttribute('aria-pressed',active==='cafe');ui.houseTab.setAttribute('aria-pressed',active==='house');
 ui.title.textContent=active==='cafe'?'Cafeteria 1178':'Coffee & House';
 ui.hint.textContent=active==='cafe'?'Cafés · confeitaria · salgados':'Drinks · petiscos · bebidas';
 document.querySelector('.tag').textContent=active==='house'?'ENTRE O CAFÉ E A NOITE':'UMA NOVA FORMA DE VIVER O CAFÉ';
 ui.products.innerHTML=menus[active].map((p,i)=>{
  const file=photoFileMap[p.name],src=file?(file.startsWith('./')?file:window.COFFEE_PHOTOS?.[file]):null;
  const full=['Caffè d’Oro','Aperol Spritz','Drink de Maçã Verde sem Álcool','Gin Tônica'].includes(p.name);
  const available=availability(p,catalog,connected);
  const media=src?`<div class="product-media${full?' drink-full':''}"><img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>`:'';
  return `<article class="product">${media}<h3>${esc(p.name)}</h3>${p.note?`<p>${esc(p.note)}</p>`:''}${p.photoStatus&&!src?`<div class="photo-note">${esc(p.photoStatus)}</div>`:''}<div class="bottom"><span class="price">${money(p.price)}</span><button class="add" data-add="${i}" ${!available.ok||sender?.pending?'disabled':''}>Adicionar +</button></div>${available.ok?'':`<span class="unavailable">${esc(available.reason)}</span>`}</article>`;
 }).join('');
 ui.products.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
  if(sender?.pending||sender?.busy)return;
  const p=menus[active][+b.dataset.add];if(!availability(p,catalog,connected).ok)return;
  if(cartCount()>=MAX_UNITS||(!cart[p.productId]&&Object.keys(cart).length>=MAX_LINES))return msg('Limite do pedido atingido.');
  const item=cart[p.productId]||{quantity:0,note:''};if(item.quantity>=MAX_QUANTITY)return;
  cart[p.productId]={...item,quantity:item.quantity+1};ui.count.textContent=cartCount();
 });
 ui.count.textContent=cartCount();
}
function renderCart(){
 const locked=!!sender?.pending||!!sender?.busy;
 let total=0;
 ui.cartItems.innerHTML=Object.entries(cart).map(([id,item])=>{
  const p=visualById(id);if(!p)return '';
  total+=p.price*item.quantity;
  return `<div class="cartrow"><div><strong>${esc(p.name)}</strong><small>${money(p.price)} cada · Subtotal ${money(p.price*item.quantity)}</small><label><span class="photo-note">Observação</span><textarea class="customer-note" data-note="${id}" maxlength="${MAX_NOTE}" rows="2" placeholder="Ex.: sem açúcar" ${locked?'disabled':''}>${esc(item.note)}</textarea></label></div><div class="qty"><button data-minus="${id}" aria-label="Diminuir ${esc(p.name)}" ${locked?'disabled':''}>−</button><span>${item.quantity}</span><button data-plus="${id}" aria-label="Aumentar ${esc(p.name)}" ${locked||item.quantity>=MAX_QUANTITY?'disabled':''}>+</button></div></div>`;
 }).join('')||'<div class="empty-cart">Nenhum produto selecionado.</div>';
 ui.cartTotal.textContent=money(total);
 ui.sendOrder.disabled=!connected||!Object.keys(cart).length||!!sender?.busy;
 ui.sendOrder.textContent=sender?.busy?'Enviando…':sender?.pending?'Confirmar envio anterior':'Enviar pedido';
 ui.cartItems.querySelectorAll('[data-note]').forEach(input=>input.oninput=()=>{cart[input.dataset.note].note=input.value;});
 ui.cartItems.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{if(locked)return;const id=b.dataset.minus;if(--cart[id].quantity<=0)delete cart[id];renderCart();ui.count.textContent=cartCount();});
 ui.cartItems.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{if(locked||cartCount()>=MAX_UNITS)return;cart[b.dataset.plus].quantity++;renderCart();ui.count.textContent=cartCount();});
}
function openCart(){lastFocus=document.activeElement;renderCart();ui.overlay.classList.add('open');ui.overlay.setAttribute('aria-hidden','false');document.body.classList.add('cart-open');ui.closeCart.focus();}
function closeCart(){ui.overlay.classList.remove('open');ui.overlay.setAttribute('aria-hidden','true');document.body.classList.remove('cart-open');lastFocus?.focus();}
ui.cafeTab.onclick=()=>{active='cafe';render();};ui.houseTab.onclick=()=>{active='house';render();};
ui.cartBtn.onclick=openCart;ui.closeCart.onclick=closeCart;ui.overlay.onclick=e=>{if(e.target===ui.overlay)closeCart();};
document.addEventListener('keydown',e=>{
 if(!ui.overlay.classList.contains('open'))return;
 if(e.key==='Escape')closeCart();
 if(e.key==='Tab'){
  const nodes=[...ui.overlay.querySelectorAll('button:not(:disabled),textarea:not(:disabled)')];
  const first=nodes[0],last=nodes.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }
});
function errorText(error){
 const code=error?.message||'';
 const known={CUSTOMER_QR_INVALID:'QR inválido ou desativado. Consulte a equipe.',CUSTOMER_TABLE_LOCKED:'Esta sessão já pertence a outra mesa. Consulte a equipe.',CUSTOMER_SESSION_INVALID:'Sua sessão expirou ou foi encerrada. Leia novamente o QR da mesa para iniciar uma nova visita.',CUSTOMER_TABLE_UNAVAILABLE:'Mesa em fechamento. Consulte a equipe.',CUSTOMER_AUTH_REQUIRED:'Não foi possível validar sua sessão de cliente.',CUSTOMER_PRODUCT_UNAVAILABLE:'Um produto ficou indisponível. Consulte a equipe.',CUSTOMER_RATE_LIMIT:'Aguarde alguns segundos e confirme novamente.',CUSTOMER_ORDER_LIMIT:'Limite de pedidos desta sessão atingido. Consulte a equipe.',CUSTOMER_PRICE_CHANGED:'O preço mudou antes da confirmação. Nenhum pedido foi criado. Consulte a equipe.',CUSTOMER_IDEMPOTENCY_CONFLICT:'O envio anterior precisa ser conferido com a equipe.'};
 return known[code]||'Não foi possível confirmar. Confira a conexão e tente novamente; o mesmo envio não será duplicado.';
}
function invalidate(error){
 if(['CUSTOMER_SESSION_INVALID','CUSTOMER_AUTH_REQUIRED','CUSTOMER_TABLE_LOCKED','CUSTOMER_QR_INVALID'].includes(error?.message)){
  connected=false;clearTimeout(statusTimer);render();renderCart();msg(errorText(error));
 }
}
function renderOrders(){
 ui.orderStatus.innerHTML=orders.map(o=>`<article><strong>Pedido #${esc(o.number)} · ${esc(statusLabel(o.status))}</strong><p>${(o.items||[]).map(i=>`${esc(i.quantity)}× ${esc(i.name)}`).join(' · ')}</p><p>Total confirmado: ${money(o.total_cents)}</p></article>`).join('');
}
async function refreshStatus(){
 if(!connected||refreshing)return;
 refreshing=true;clearTimeout(statusTimer);
 try{
  const {data,error}=await client.rpc('get_customer_orders');if(error)throw error;
  orders=data||[];renderOrders();ui.connectionNote.textContent='Pedidos enviados para a equipe da Coffee 1178.';
 }catch(error){invalidate(error);ui.connectionNote.textContent='Acompanhamento indisponível. Tentaremos novamente.';}
 finally{refreshing=false;if(connected&&!document.hidden)statusTimer=setTimeout(refreshStatus,10000);}
}
ui.sendOrder.onclick=async()=>{
 if(!connected||!sender||sender.busy)return;
 // Verify current prices/availability before a NEW submission. A retry must use
 // the exact original payload/key even if the menu subsequently changed.
 try{
  if(!sender.pending){
   const {data,error}=await client.rpc('get_customer_menu');if(error)throw error;catalog=data||[];
   buildItems(cart);
   for(const id of Object.keys(cart))if(!availability(visualById(id),catalog,true).ok)throw new Error('CUSTOMER_PRODUCT_UNAVAILABLE');
  }
  const expectedTotal=sender.pending?.expectedTotal ?? Object.entries(cart).reduce((sum,[id,item])=>sum+visualById(id).price*item.quantity,0);
  const promise=sender.send(cart,expectedTotal);renderCart();render();
  const result=await promise;
  cart={};render();renderCart();
  ui.sendMessage.textContent=`Pedido #${result.number} enviado com sucesso. Total confirmado: ${money(result.total_cents)}.`;
  msg('Pedido enviado com sucesso. Acompanhe o preparo abaixo.');
  await refreshStatus();
 }catch(error){ui.sendMessage.textContent=errorText(error);invalidate(error);}
 finally{renderCart();render();}
};
document.addEventListener('visibilitychange',()=>{clearTimeout(statusTimer);if(!document.hidden)refreshStatus();});
window.addEventListener('online',()=>{if(connected)refreshStatus();});
window.addEventListener('offline',()=>{ui.connectionNote.textContent='Sem conexão. Nenhum pedido será enviado automaticamente.';});
async function boot(qrToken){
 render();
 const params=new URLSearchParams(location.search),token=qrToken ?? params.get('t');
 if(token!==null&&!/^[0-9a-f]{64}$/.test(token)){msg('QR inválido. Use o QR da sua mesa.');return;}
 // Remove the bearer QR from browser history before loading any external SDK.
 if(token!==null){params.delete('t');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
 const cfg=window.COFFEE1178_CONFIG||{};
 if(!cfg.SUPABASE_URL||!cfg.SUPABASE_KEY){msg('Autoatendimento em preparação. Consulte a equipe.');return;}
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
  client=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY,{auth:{storageKey:'coffee1178.customer.auth.v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  let {data:{session},error}=await client.auth.getSession();if(error)throw error;
  if(!session){if(!token){msg('Escaneie o QR da sua mesa para iniciar.');return;}const res=await client.auth.signInAnonymously();if(res.error)throw res.error;session=res.data.session;}
  if(!session?.user?.is_anonymous)throw new Error('CUSTOMER_AUTH_REQUIRED');
  const started=await client.rpc('start_customer_session',{p_token:token});if(started.error)throw started.error;
  const menu=await client.rpc('get_customer_menu');if(menu.error)throw menu.error;
  catalog=menu.data||[];connected=true;
  ui.tableLabel.textContent=`Mesa ${String(started.data.table_number).padStart(2,'0')}`;
  sender=new OrderSender({rpc:(...args)=>client.rpc(...args),storage:localStorage,storageKey:`coffee1178.customer.pending.${session.user.id}`});
  if(sender.pending){cart=Object.fromEntries(sender.pending.items.map(i=>[i.product_id,{quantity:i.quantity,note:i.note||''}]));msg('Há um envio aguardando confirmação. Abra o carrinho para confirmar com segurança.');}
  else msg('Escolha seus produtos e envie o pedido.');
  render();await refreshStatus();
 }catch(error){
  connected=false;msg(errorText(error));render();
  if(error?.message==='CUSTOMER_SESSION_INVALID' && token && client){
   ui.newVisit.hidden=false;
   ui.newVisit.onclick=async()=>{
    ui.newVisit.disabled=true;
    try{
     const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
     sender=null;cart={};orders=[];renderOrders();ui.newVisit.hidden=true;
     await boot(token);
    }catch(error){msg(errorText(error));}
    finally{ui.newVisit.disabled=false;}
   };
  }
 }
}
boot();
