"""Two original frontends, shared local mock RPCs. No Supabase writes or live auth."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread,Lock
from urllib.parse import urlparse,unquote
import json,time,copy
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
client_root=root/'coffee1178-os-v1.0.1-stable/coffee1178-os-stable'
os_root=client_root/'operacional-staging'
fixture={
 'tables':[{'id':'d2646bef-1acf-40d0-8077-dbcd975be950','number':1,'name':'Mesa 01','status':'occupied'}],
 'products':json.loads((root/'tests/fixtures/products.json').read_text()),
 'operator':{'id':'f1178000-0000-0000-0000-000000000001','name':'Administrador Staging (teste local)','role':'admin'},
 'orders':[
  {'id':'42c35584-8a54-4c1b-8423-38d1a8510de1','number':3,'table_id':'d2646bef-1acf-40d0-8077-dbcd975be950','status':'sent','source':'customer','created_by_name':'Cliente','created_at':'2026-11-06T10:43:56Z','total_cents':1290,'order_items':[{'product_name':'Café Especial 1178','quantity':1,'note':None},{'product_name':'Café Tradicional','quantity':1,'note':'Sem coco'}]},
  {'id':'8650aea9-c6b3-43e2-8851-e838f30e4aba','number':2,'table_id':'d2646bef-1acf-40d0-8077-dbcd975be950','status':'sent','source':'customer','created_by_name':'Cliente','created_at':'2026-11-06T09:26:26Z','total_cents':300,'order_items':[{'product_name':'Café Tradicional','quantity':1,'note':None}]}
 ]
}
lock=Lock()
state={'tables':copy.deepcopy(fixture['tables']),'orders':copy.deepcopy(fixture['orders']),'products':fixture['products'],'revision':0,'reads':[],'active':0,'max_active':0,'delay':0}
new_id='60000000-0000-4000-8000-000000000004'
policy="script-src 'self' https://cdn.jsdelivr.net; script-src-attr 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def translate_path(self,path):
  path=unquote(urlparse(path).path)
  if path.startswith('/operacional-staging/'):
   return str(os_root/path.removeprefix('/operacional-staging/'))
  return str(client_root/path.lstrip('/'))
 def end_headers(self):
  self.send_header('Content-Security-Policy',policy);super().end_headers()
 def respond(self,body):
  raw=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def do_POST(self):
  payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if self.path=='/mock/revision':return self.respond({'revision':state['revision']})
  if self.path=='/mock/table':
   return self.respond({'data':copy.deepcopy(state.get({'cafe_tables':'tables','orders':'orders','products':'products'}.get(payload['table'],''),[]))})
  name,args=payload['name'],payload.get('args') or {}
  if name=='current_operator':return self.respond({'data':[fixture['operator']]})
  if name=='start_customer_session':return self.respond({'data':{'table_number':1,'table_name':'Mesa 01'}})
  if name=='get_customer_menu':return self.respond({'data':state['products']})
  if name=='get_customer_orders':
   with lock:
    state['reads'].append(time.monotonic());state['active']+=1;state['max_active']=max(state['max_active'],state['active'])
    rows=copy.deepcopy(state['orders']);delay=state['delay'];state['delay']=0
   time.sleep(delay)
   result=[]
   for o in rows:
    result.append({**o,'items':[{'name':i['product_name'],'quantity':i['quantity'],'note':i.get('note')} for i in o['order_items']]})
   self.respond({'data':result})
   with lock:state['active']-=1
   return
  if name=='create_customer_order':
   items=[];total=0
   for item in args['p_items']:
    product=next(p for p in state['products'] if p['id']==item['product_id'])
    items.append({'product_id':product['id'],'product_name':product['name'],'quantity':item['quantity'],'note':item['note']})
    total+=product['price_cents']*item['quantity']
   assert total==args['p_expected_total_cents']
   order={'id':new_id,'number':4,'table_id':state['tables'][0]['id'],'source':'customer','status':'sent','created_at':'2026-11-06T23:59:59Z','created_by_name':'Cliente','total_cents':total,'order_items':items}
   with lock:state['orders'].insert(0,order);state['revision']+=1
   return self.respond({'data':{'id':new_id,'number':4,'total_cents':total}})
  if name=='set_order_status':
   order=next(o for o in state['orders'] if o['id']==args['p_order_id'])
   assert {'sent':'preparing','preparing':'ready','ready':'delivered'}[order['status']]==args['p_status']
   with lock:order['status']=args['p_status'];state['revision']+=1
   return self.respond({'data':None})
  if name=='cancel_order':
   order=next(o for o in state['orders'] if o['id']==args['p_order_id']);assert order['status']=='sent'
   with lock:order['status']='cancelled';state['revision']+=1
   return self.respond({'data':None})
  raise AssertionError(name)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}'
sdk='''
export function createClient(url,key,options){
 if(url!=='https://qjeosulasnnafpnwgimu.supabase.co')throw Error('Wrong environment');
 const rpc=async(name,args)=>{
  if(name==='get_customer_orders'){window.testReads=(window.testReads||0)+1;window.testActive=(window.testActive||0)+1;window.testMaxActive=Math.max(window.testMaxActive||0,window.testActive);}
  try{return await (await fetch('/mock/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})})).json();}
  finally{if(name==='get_customer_orders')window.testActive--;}
 };
 return {
  auth:{getSession:async()=>({data:{session:{user:{id:'mock-session',is_anonymous:true}}}})},rpc,
  from(table){const q={select(){return q},order(){return q},limit(){return q},eq(){return q},then(resolve,reject){return fetch('/mock/table',{method:'POST',body:JSON.stringify({table})}).then(r=>r.json()).then(resolve,reject)}};return q;},
  channel(){let callbacks=[],last=-1,timer;const c={on(event,filter,cb){callbacks.push(cb);return c},subscribe(){timer=setInterval(async()=>{const r=await(await fetch('/mock/revision',{method:'POST',body:'{}'})).json();if(r.revision!==last){last=r.revision;callbacks.forEach(cb=>cb())}},300);return c},stop(){clearInterval(timer)}};return c;},removeChannel(c){c.stop();}
 };
}
'''
with sync_playwright() as p:
 customer_browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 operator_browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 cc=customer_browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
 oc=operator_browser.new_context(viewport={'width':1024,'height':768},service_workers='block')
 for context in [cc,oc]:
  context.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body=sdk,headers={'Access-Control-Allow-Origin':'*'}))
  context.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.COFFEE1178_CONFIG={SUPABASE_URL:'https://qjeosulasnnafpnwgimu.supabase.co',SUPABASE_KEY:'public-local-test-key'};"))
 customer=cc.new_page();operator=oc.new_page();errors=[]
 customer.on('pageerror',lambda e:errors.append(str(e)));operator.on('pageerror',lambda e:errors.append(str(e)))
 customer.goto(url+'/?t='+'a'*64);operator.goto(url+'/operacional-staging/')
 customer.wait_for_selector('[data-order-status="sent"]');operator.wait_for_selector('[data-table]')
 customer.evaluate("() => {window.navigationSentinel='same-document'}")
 with lock:state['delay']=1.5
 product=customer.locator('article.product').filter(has=customer.get_by_role('heading',name='Café Tradicional',exact=True))
 product.get_by_role('button',name='Adicionar +').click();customer.locator('#cartBtn').click();customer.locator('textarea').fill('Sem açúcar')
 customer.locator('#sendOrder').click()
 card=customer.locator('[data-order-id="'+new_id+'"]')
 card.wait_for(state='visible',timeout=1200)
 assert card.get_attribute('data-order-status')=='sent'
 assert 'Pedido #4' in card.inner_text() and 'Sem açúcar' in card.inner_text() and '3,00' in card.inner_text()
 assert not customer.locator('#overlay').evaluate("e=>e.classList.contains('open')")
 operator.locator('[data-nav="kitchen"]').click()
 older=fixture['orders'][0]['id']
 for current,label,next_status in [('sent','Preparando','preparing'),('preparing','Pronto','ready'),('ready','Entregue','delivered')]:
  operator.locator('[data-filter="'+current+'"]').click()
  os_card=operator.locator('article').filter(has_text='#0004');os_card.wait_for(state='visible')
  start=time.monotonic();os_card.get_by_role('button',name=label,exact=True).click()
  customer.wait_for_function("id => document.querySelector('[data-order-id=\\\"'+id+'\\\"]').dataset.orderStatus==='"+next_status+"'",arg=new_id,timeout=8000)
  elapsed=time.monotonic()-start
  assert elapsed<7.5,(next_status,elapsed)
  assert customer.locator('[data-order-id="'+older+'"]').get_attribute('data-order-status')=='sent'
  assert customer.evaluate("() => window.navigationSentinel")=='same-document'
  print(f'PASS OS {current} -> {next_status}; client refreshed automatically in {elapsed:.2f}s')
 assert 'Pedido entregue. Aproveite seu momento na Coffee 1178.' in card.inner_text()
 assert card.locator('.order-step.is-complete').count()==4
 card.screenshot(path='/tmp/coffee-delivered-timeline.png')
 operator.locator('[data-filter="sent"]').click();operator.on('dialog',lambda d:d.accept())
 operator.locator('article').filter(has_text='#0003').get_by_role('button',name='Cancelar',exact=True).click()
 customer.wait_for_function("id => document.querySelector('[data-order-id=\\\"'+id+'\\\"]').dataset.orderStatus==='cancelled'",arg=older,timeout=8000)
 assert 'Pedido cancelado. Consulte nossa equipe.' in customer.locator('[data-order-id="'+older+'"]').inner_text()
 with lock:state['delay']=6.2
 customer.wait_for_function('() => window.testActive===1',timeout=8000)
 customer.evaluate("() => {document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'))}")
 customer.wait_for_timeout(6500)
 assert customer.evaluate('() => window.testMaxActive')==1
 assert state['max_active']==1
 before=customer.evaluate('() => window.testReads')
 cc.set_offline(True);customer.wait_for_timeout(5500)
 assert customer.evaluate('() => window.testReads')==before
 cc.set_offline(False)
 customer.wait_for_function('before => window.testReads>before',arg=before,timeout=2500)
 customer.wait_for_function('() => window.testActive===0')
 customer.evaluate("() => {window.testHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});document.dispatchEvent(new Event('visibilitychange'))}")
 before=customer.evaluate('() => window.testReads');customer.wait_for_timeout(5500)
 assert customer.evaluate('() => window.testReads')==before
 customer.evaluate("() => {window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'))}")
 customer.wait_for_function('before => window.testReads>before',arg=before,timeout=2500)
 customer.get_by_role('button',name='Coffee & House',exact=True).click();assert card.evaluate("e=>getComputedStyle(e).color==='rgb(247, 239, 230)'");card.screenshot(path='/tmp/coffee-house-delivered-timeline.png')
 assert customer.evaluate('() => document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 print('PASS immediate acknowledged order; independent statuses; cancellation; 5s polling; no overlap under a 6.2s response; no client reload. Offline/background polling paused and resumed. LOCAL MOCK ONLY: live staging authentication not exercised.')
 customer_browser.close();operator_browser.close()
server.shutdown()
