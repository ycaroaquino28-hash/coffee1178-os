import {escapeHtml as esc,money,statusLabel} from './customer-core.mjs?v=tracking-20261106-01';
export const POLL_INTERVAL_MS=5000;
export const ORDER_STEPS=[
 {status:'sent',label:'Pedido recebido'},
 {status:'preparing',label:'Preparando'},
 {status:'ready',label:'Pronto para servir'},
 {status:'delivered',label:'Entregue'}
];
export function trackingState(status){
 const index=ORDER_STEPS.findIndex(step=>step.status===status);
 return ORDER_STEPS.map((step,i)=>({...step,complete:index>=0&&(i<index||status==='delivered'),current:i===index}));
}
export function mergeAcknowledgedOrders(serverOrders,acknowledged){
 const rows=new Map(serverOrders.map(order=>[order.id,order]));
 for(const [id,order] of acknowledged){
  if(rows.has(id))acknowledged.delete(id);
  else rows.set(id,order);
 }
 return [...rows.values()].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
}
export function renderOrderTracking(order){
 const terminal=order.status==='cancelled'||order.status==='closed';
 const steps=terminal?'':`<ol class="order-timeline" aria-label="Progresso do pedido ${esc(order.number)}">${trackingState(order.status).map(step=>{
  const state=step.current?'Etapa atual':step.complete?'Concluído':'Aguardando';
  const icon=step.complete?'✓':step.current?'●':'○';
  return `<li class="order-step${step.complete?' is-complete':''}${step.current?' is-current':''}"${step.current?' aria-current="step"':''}><span class="order-step-mark" aria-hidden="true">${icon}</span><span class="order-step-label">${step.label}<span class="sr-only"> — ${state}</span></span></li>`;
 }).join('')}</ol>`;
 const message=order.status==='delivered'?'Pedido entregue. Aproveite seu momento na Coffee 1178.':order.status==='cancelled'?'Pedido cancelado. Consulte nossa equipe.':order.status==='closed'?'Pedido finalizado.':null;
 return `<article class="order-tracking${order.status==='cancelled'?' is-cancelled':''}" data-order-id="${esc(order.id)}" data-order-status="${esc(order.status)}"><div class="order-tracking-head"><h3>Pedido #${esc(order.number)}</h3><span class="order-status-badge">${esc(statusLabel(order.status))}</span></div><ul class="order-tracking-items">${(order.items||[]).map(item=>`<li><span>${esc(item.quantity)}× ${esc(item.name)}</span>${item.note?`<small>${esc(item.note)}</small>`:''}</li>`).join('')}</ul><p class="order-tracking-total">Total confirmado: <strong>${money(order.total_cents)}</strong></p>${steps}${message?`<p class="order-tracking-message">${message}</p>`:''}</article>`;
}
