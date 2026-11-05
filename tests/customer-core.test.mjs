import test from 'node:test';
import assert from 'node:assert/strict';
import {availability,buildItems,OrderSender,escapeHtml,statusLabel} from '../coffee1178-os-v1.0.1-stable/coffee1178-os-stable/assets/customer-core.mjs';
import {menus,photoFileMap} from '../coffee1178-os-v1.0.1-stable/coffee1178-os-stable/assets/customer-menu.mjs';
import fs from 'node:fs';
const id='8a451ca7-c780-40ba-ad3d-00a5675cb298';
const cart=()=>({[id]:{quantity:2,note:' sem sal '}});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const result={id:'order-1',number:1,total_cents:3980};
test('payload excludes browser prices, table and session; bounds are enforced',()=>{
 assert.deepEqual(buildItems(cart()),[{product_id:id,quantity:2,note:'sem sal'}]);
 for(const quantity of [0,-1,1.5,100,NaN,'2'])assert.throws(()=>buildItems({[id]:{quantity,note:''}}));
 assert.throws(()=>buildItems({[id]:{quantity:2,note:'x'.repeat(301)}}));
 assert.throws(()=>buildItems({}));
});
test('SQL product IDs are associated while photos and Caffè price remain approved',()=>{
 const p=menus.house.find(p=>p.name==='Caffè d’Oro');assert.equal(p.price,3290);assert.equal(p.productId,'8b19f66e-a480-4ad3-af32-ebb95e94e696');
 assert.equal(photoFileMap['Gin Tônica'],'./assets/menu/gin-tonica.png');
 assert.equal(photoFileMap['Aperol Spritz'],'aperol.jpg');assert.equal(photoFileMap['Caffè d’Oro'],'caffe-doro.jpg');
});
test('inactive/absent products, unresolved aliases and changed prices fail closed',()=>{
 const p=menus.cafe.find(p=>p.name==='Croissant Canastra');
 assert.equal(availability(p,[{id:p.productId,price_cents:p.price}],true).ok,true);
 assert.equal(availability(p,[],true).ok,false);
 assert.equal(availability(p,[{id:p.productId,price_cents:1}],true).ok,false);
 assert.equal(availability({...p,mappingReviewed:false},[{id:p.productId,price_cents:p.price}],true).ok,false);
 assert.equal(availability(p,[{id:p.productId,price_cents:p.price}],false).ok,false);
});
test('double click makes only one network request',async()=>{
 let done,calls=0;
 const sender=new OrderSender({storage:memory(),storageKey:'k',uuid:()=> 'key',rpc:()=>{calls++;return new Promise(r=>done=r);}});
 const first=sender.send(cart(),3980);await assert.rejects(()=>sender.send(cart(),3980),/já está/);
 assert.equal(calls,1);done({data:result});assert.deepEqual(await first,result);assert.equal(sender.pending,null);
});
test('lost acknowledgement and page reload retain the same idempotency key',async()=>{
 const store=memory(),calls=[];
 const fail=new OrderSender({storage:store,storageKey:'k',uuid:()=> 'same-key',rpc:async(name,args)=>{calls.push(args);throw new Error('network');}});
 await assert.rejects(()=>fail.send(cart(),3980));assert.equal(fail.busy,false);
 const retry=new OrderSender({storage:store,storageKey:'k',uuid:()=> 'must-not-be-used',rpc:async(name,args)=>{calls.push(args);return {data:result};}});
 await retry.send(cart(),3980);assert.deepEqual(calls[0],calls[1]);assert.equal(store.getItem('k'),null);
});
test('uncertain submission cannot be replaced by an edited cart',async()=>{
 let calls=0;const sender=new OrderSender({storage:memory(),storageKey:'k',rpc:async()=>{calls++;throw new Error('timeout');}});
 await assert.rejects(()=>sender.send(cart(),3980));
 await assert.rejects(()=>sender.send({[id]:{quantity:3,note:''}},5970),/envio anterior/);assert.equal(calls,1);
});
test('storage failure prevents sending an order without a durable key',async()=>{
 let calls=0;const sender=new OrderSender({storage:{getItem:()=>null,setItem:()=>{throw Error('full');}},storageKey:'k',rpc:async()=>{calls++;}});
 await assert.rejects(()=>sender.send(cart(),3980));await assert.rejects(()=>sender.send(cart(),3980));assert.equal(calls,0);
});
test('escape user/product text and map operational statuses',()=>{
 assert.equal(escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
 assert.equal(statusLabel('sent'),'Pedido recebido');assert.equal(statusLabel('preparing'),'Preparando');assert.equal(statusLabel('ready'),'Pronto');
});
test('prepared SQL does not modify staff RPCs or grant customer access to operational tables',()=>{
 const sql=fs.readFileSync(new URL('../supabase/proposals/customer_self_service.sql',import.meta.url),'utf8');
 assert(!/create (or replace )?function public\.create_order\(/i.test(sql));
 assert(!/grant select[^;]*to authenticated/i.test(sql));
 assert(sql.includes('nobypassrls'));assert(sql.includes('orders_source_consistency'));
 assert(sql.includes('primary key(session_id,request_key)'));
});

test('a definite server rejection unlocks cart editing; network errors do not',async()=>{
 const sender=new OrderSender({storage:memory(),storageKey:'k',rpc:async()=>({error:{code:'P0001',message:'CUSTOMER_PRODUCT_UNAVAILABLE'}})});
 await assert.rejects(()=>sender.send(cart(),3980));assert.equal(sender.pending,null);
});

test('expected checkout total is only sent as a consent guard',async()=>{
 let sent;const sender=new OrderSender({storage:memory(),storageKey:'k',rpc:async(name,args)=>{sent=args;return {data:result};}});
 await sender.send(cart(),3980);assert.equal(sent.p_expected_total_cents,3980);assert(!('price_cents' in sent.p_items[0]));
});

test('approved commercial products use exact names, prices and UUIDs and can be ordered',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('fixtures/products.json',import.meta.url),'utf8'));
 const approved=[['Coca-Cola Original 350 ml',700,'145c5004-b381-4061-a431-2e3185251b1d'],['Coca-Cola Zero 350 ml',700,'bf586ace-5b11-4b38-9002-1cc693f42a1f'],['Suco de Uva em Lata',700,'6f951d49-cab7-4382-ba98-000f345d0645'],['Leite e Canela',890,'120ca94f-5925-420c-8522-972555a27b4a']];
 for(const [name,price,id] of approved){
  const entries=Object.values(menus).flat().filter(p=>p.name===name);assert(entries.length);
  for(const item of entries){assert.equal(item.productId,id);assert.equal(item.price,price);assert.equal(item.mappingReviewed,true);assert.equal(availability(item,catalog,true).ok,true);}
  const p=catalog.find(p=>p.id===id);assert.equal(p.name,name);assert.equal(p.price_cents,price);assert.equal(p.active,true);
 }
 assert.equal(photoFileMap['Leite e Canela'],'latte-cannella.webp');
});
test('only the four unapproved associations remain blocked and reconciliation has no price/missing differences',()=>{
 const blocked=['Tortinha de Frango com Requeijão','Pão na Chapa com Requeijão','Bolo de Cenoura com Calda','Drink de Maçã Verde sem Álcool'].sort();
 const catalog=JSON.parse(fs.readFileSync(new URL('fixtures/products.json',import.meta.url),'utf8'));
 const unique=[...new Map(Object.values(menus).flat().map(p=>[p.name,p])).values()];
 assert.deepEqual(unique.filter(p=>!availability(p,catalog,true).ok).map(p=>p.name).sort(),blocked);
 const rows=JSON.parse(fs.readFileSync(new URL('../docs/product-reconciliation.json',import.meta.url),'utf8'));
 assert.equal(rows.length,40);assert.equal(catalog.length,40);
 assert.equal(rows.filter(r=>r.situation==='igual').length,19);
 assert.equal(rows.filter(r=>r.situation==='nome diferente').length,21);
 for(const item of unique){const r=rows.find(r=>r.site===item.name);assert.equal(r.product_id,item.productId);assert.equal(r.site_price_cents,item.price);assert.equal(r.supabase_price_cents,item.price);}
});


test('managed Supabase customer auth reads verified request claims without direct auth schema access',()=>{
 const sql=fs.readFileSync(new URL('../supabase/proposals/customer_self_service.sql',import.meta.url),'utf8');
 const match=sql.match(/create function customer_private\.require_customer\(\)[\s\S]*?end \$\$;/);
 assert(match,'require_customer function not found');
 const block=match[0];
 assert.match(block,/current_setting\('request\.jwt\.claims'/);
 assert(!block.includes('auth.uid()'));
 assert(!block.includes('auth.jwt()'));
});
