import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingState,renderOrderTracking,mergeAcknowledgedOrders,POLL_INTERVAL_MS} from '../coffee1178-os-v1.0.1-stable/coffee1178-os-stable/assets/customer-tracking.mjs';
const order={id:'one',number:12,status:'sent',total_cents:1290,items:[{name:'Café Especial 1178',quantity:1,note:'Sem açúcar'}]};
test('each stage highlights only itself and completes only preceding stages',()=>{
 for(const [i,status] of ['sent','preparing','ready','delivered'].entries()){
  const steps=trackingState(status);assert.equal(steps.filter(s=>s.current).length,1);assert.equal(steps[i].current,true);
  assert.equal(steps.filter(s=>s.complete).length,status==='delivered'?4:i);
 }
 assert.equal(POLL_INTERVAL_MS,5000);
});
test('tracking includes number, items, notes, confirmed total and four labels',()=>{
 const html=renderOrderTracking(order);
 for(const text of ['Pedido #12','Café Especial 1178','Sem açúcar','12,90','Pedido recebido','Preparando','Pronto para servir','Entregue'])assert(html.includes(text),text);
 assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
});
test('delivered/cancelled/closed have accurate terminal messages',()=>{
 assert(renderOrderTracking({...order,status:'delivered'}).includes('Pedido entregue. Aproveite seu momento na Coffee 1178.'));
 const cancelled=renderOrderTracking({...order,status:'cancelled'});assert(cancelled.includes('Pedido cancelado. Consulte nossa equipe.'));assert(!cancelled.includes('aria-current'));
 const closed=renderOrderTracking({...order,status:'closed'});assert(closed.includes('Finalizado'));assert(!closed.includes('Pedido entregue.'));
});
test('order and note text cannot inject HTML',()=>{
 const html=renderOrderTracking({...order,number:'<b>',items:[{name:'<img>',quantity:1,note:'<script>oops</script>'}]});
 assert(!html.includes('<script>'));assert(!html.includes('<img>'));assert(html.includes('&lt;script&gt;'));
});
test('acknowledged submission survives a poll started before its creation',()=>{
 const ack=new Map([['one',{...order,created_at:'2026-11-06T12:00:00Z'}]]);
 const rows=mergeAcknowledgedOrders([{...order,id:'older',created_at:'2026-11-06T11:00:00Z'}],ack);
 assert.equal(rows[0].id,'one');assert.equal(ack.size,1);
 const received=mergeAcknowledgedOrders([{...order,status:'preparing'}],ack);
 assert.equal(received.length,1);assert.equal(received[0].status,'preparing');assert.equal(ack.size,0);
});
test('multiple orders retain independent progress states',()=>{
 const rows=mergeAcknowledgedOrders([order,{...order,id:'two',number:13,status:'ready'}],new Map());
 assert.equal(rows[0].status,'sent');assert.equal(rows[1].status,'ready');
 assert(renderOrderTracking(rows[0]).includes('data-order-status="sent"'));
 assert(renderOrderTracking(rows[1]).includes('data-order-status="ready"'));
});
