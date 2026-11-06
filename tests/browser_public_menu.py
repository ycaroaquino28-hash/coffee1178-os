"""Regression: saved Mesa 02 must not leak into the public Instagram entry."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
site=root/'coffee1178-os-v1.0.1-stable/coffee1178-os-stable'
products=json.loads((root/'tests/fixtures/products.json').read_text())
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.split('?')[0].rstrip('/')=='/pedido':self.path='/index.html'
  return super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(site)))
Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}'
sdk='''
window.testSdkLoaded=true;
const products=PRODUCTS;
export function createClient(){
 const bump=k=>localStorage.setItem(k,String(+(localStorage.getItem(k)||0)+1));
 return {
  auth:{getSession:async()=>{bump('test-auth-reads');return {data:{session:localStorage.getItem('test-auth')?{user:{id:'test-user',is_anonymous:true}}:null}};},signInAnonymously:async()=>{localStorage.setItem('test-auth','yes');return {data:{session:{user:{id:'test-user',is_anonymous:true}}}};},signOut:async()=>{bump('test-signouts');localStorage.removeItem('test-auth');return {}; }},
  rpc:async(name,args)=>{
   bump('test-rpc-calls');
   if(name==='start_customer_session'){
    const old=localStorage.getItem('test-table');
    const table=args.p_token?(args.p_token==='b'.repeat(64)?2:1):Number(old);
    if(old && +old!==table)return {error:{message:'CUSTOMER_TABLE_LOCKED'}};
    if(!table)return {error:{message:'CUSTOMER_SESSION_INVALID'}};
    localStorage.setItem('test-table',table);return {data:{table_number:table}};
   }
   if(name==='get_customer_menu')return {data:products};
   if(name==='get_customer_orders')return {data:[{id:'test-order',number:2,status:'sent',total_cents:300,items:[{quantity:1,name:'Café Tradicional'}]}]};
   throw Error('Unexpected RPC');
  }
 };
}
'''.replace('PRODUCTS',json.dumps(products))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
 requests=[]
 def serve_sdk(route):
  requests.append(route.request.url)
  route.fulfill(content_type='application/javascript',body=sdk,headers={'Access-Control-Allow-Origin':'*'})
 context.route('https://cdn.jsdelivr.net/**',serve_sdk)
 context.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.COFFEE1178_CONFIG={SUPABASE_URL:'https://vljmywnyzgbssqeyxtbq.supabase.co',SUPABASE_KEY:'public-local-test-key'};"))
 qr=context.new_page();errors=[];qr.on('pageerror',lambda e:errors.append(str(e)))
 qr.goto(url+'/')
 qr.evaluate("() => {localStorage.setItem('test-auth','yes');localStorage.setItem('test-table','2');localStorage.setItem('coffee1178.customer.auth.v1','saved-mesa-02-session')}")
 qr.goto(url+'/?t='+'b'*64)
 qr.wait_for_function("() => document.getElementById('tableLabel').textContent==='Mesa 02'")
 assert qr.url==url+'/pedido'
 assert qr.locator('button[data-add]:enabled').count()>0
 # The explicit ordering route resumes the same validated visit after refresh.
 qr.reload();qr.wait_for_function("() => document.getElementById('tableLabel').textContent==='Mesa 02'")
 sdk_before=len(requests)
 auth_before=qr.evaluate("() => localStorage.getItem('test-auth-reads')")
 public=context.new_page();public.on('pageerror',lambda e:errors.append(str(e)))
 for suffix in ['/','/?utm_source=instagram&mesa=2']:
  public.goto(url+suffix)
  public.wait_for_function("() => document.getElementById('tableLabel').textContent==='Cardápio'")
  assert public.locator('button[data-add]').count()==0
  assert public.locator('#cartBtn').is_hidden()
  assert public.locator('#orderStatus').is_hidden()
  assert public.locator('#orderStatus article').count()==0
  assert len(requests)==sdk_before # No Supabase SDK or saved-auth lookup on public entry.
  assert public.evaluate("() => typeof window.testSdkLoaded")=='undefined'
  assert public.evaluate("() => localStorage.getItem('test-auth-reads')")==auth_before
  assert public.evaluate("() => localStorage.getItem('test-table')")=='2'
  assert public.evaluate("() => localStorage.getItem('test-auth')")=='yes'
  assert public.evaluate("() => localStorage.getItem('test-signouts')") is None
  public.get_by_role('button',name='Coffee & House',exact=True).click()
  assert public.locator('.tag').inner_text()=='ENTRE O CAFÉ E A NOITE'
  assert public.locator('button[data-add]').count()==0
  assert public.locator('article.product').count()>0
  public.screenshot(path='/tmp/coffee-public-menu-no-table.png')
 assert qr.locator('#tableLabel').inner_text()=='Mesa 02'
 assert not errors,errors
 print('PASS: saved Mesa 02 never appears on public bio URL; public page has no ordering controls, order history or SDK calls; QR/private refresh still resumes Mesa 02; opening public menu does not sign out the active visit. Mock auth only.')
 browser.close()
server.shutdown()
