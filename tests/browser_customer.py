"""Local UI integration test with mocked Supabase SDK; does not test real RLS/RPCs."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading, json, functools
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
site = root/'coffee1178-os-v1.0.1-stable/coffee1178-os-stable'
products = json.loads((root/'tests/fixtures/products.json').read_text())
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server = ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(site)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}'
sdk='''
const catalog=PRODUCTS;
export function createClient(){return {
 auth:{
  getSession:async()=>({data:{session:localStorage.getItem('mock-signed-out')?null:{user:{id:'mock-anonymous-user',is_anonymous:true}}}}),
  signOut:async()=>{localStorage.removeItem('mock-expired');localStorage.removeItem('mock-table');localStorage.setItem('mock-signed-out','yes');return {};},
  signInAnonymously:async()=>{localStorage.removeItem('mock-signed-out');return {data:{session:{user:{id:'new-mock-anonymous-user',is_anonymous:true}}}};}
 },
 rpc:async(name,args)=>{
  await new Promise(r=>setTimeout(r,15));
  if(name==='start_customer_session'){
   if(localStorage.getItem('mock-expired'))return {error:{message:'CUSTOMER_SESSION_INVALID'}};
   if(args.p_token==='c'.repeat(64))return {error:{message:'CUSTOMER_QR_INVALID'}};
   const old=localStorage.getItem('mock-table');
   const next=args.p_token==='b'.repeat(64)?2:1;
   if(old && +old!==next)return {error:{message:'CUSTOMER_TABLE_LOCKED'}};
   localStorage.setItem('mock-table',next);
   return {data:{table_number:next,table_name:'Mesa '+next}};
  }
  if(name==='get_customer_menu')return {data:catalog};
  if(name==='create_customer_order'){
   window.mockCreateCalls=(window.mockCreateCalls||0)+1;
   window.mockPayload=args;
   await new Promise(r=>setTimeout(r,100));
   window.mockHasOrder=true;
   return {data:{id:'order-1',number:42,total_cents:3980}};
  }
  if(name==='get_customer_orders')return {data:window.mockHasOrder?[{id:'order-1',number:42,status:window.mockStatus||'sent',total_cents:3980,items:[{name:'Croissant Canastra',quantity:2}]}]:[]};
  return {error:{message:'UNEXPECTED_RPC'}};
 }
};}
'''.replace('PRODUCTS',json.dumps(products))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1)
 context.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.COFFEE1178_CONFIG={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_KEY:'public-test-key'};"))
 context.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body=sdk,headers={'Access-Control-Allow-Origin':'*'}))
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url+'/pedido?t='+'a'*64)
 # Local SimpleHTTPRequestHandler does not implement Netlify's /pedido rewrite.
 if page.locator('#tableLabel').count()==0: page.goto(url+'/?t='+'a'*64)
 page.wait_for_function("document.getElementById('tableLabel').textContent==='Mesa 01'")
 assert '?t=' not in page.url
 assert page.locator('h2#title').inner_text()=='Cafeteria 1178'
 page.get_by_role('button',name='Coffee & House',exact=True).click()
 assert page.locator('.tag').inner_text()=='ENTRE O CAFÉ E A NOITE'
 doro=page.locator('article.product').filter(has=page.get_by_role('heading',name='Caffè d’Oro',exact=True))
 assert '32,90' in doro.inner_text();assert doro.locator('img').count()==1
 gin=page.locator('article.product').filter(has=page.get_by_role('heading',name='Gin Tônica',exact=True))
 assert gin.locator('img').get_attribute('src')=='./assets/menu/gin-tonica.png'
 gin.locator('img').scroll_into_view_if_needed()
 page.wait_for_function("[...document.querySelectorAll('img')].filter(i=>i.alt==='Gin Tônica').every(i=>i.complete&&i.naturalWidth>0)")
 page.eval_on_selector_all('img', '(imgs)=>Promise.all(imgs.map(img=>{img.loading="eager";return img.decode()}))')
 page.screenshot(path='/tmp/coffee-customer-house-mobile.png',full_page=True)
 page.get_by_role('button',name='Cafeteria 1178',exact=True).click()
 item=page.locator('article.product').filter(has=page.get_by_role('heading',name='Croissant Canastra',exact=True))
 item.get_by_role('button',name='Adicionar +').click();item.get_by_role('button',name='Adicionar +').click()
 page.locator('#cartBtn').click();page.locator('textarea').fill('Sem sal <script>bad()</script>')
 assert '39,80' in page.locator('#cartTotal').inner_text()
 page.evaluate("document.getElementById('sendOrder').click();document.getElementById('sendOrder').click()")
 page.wait_for_function("document.getElementById('sendMessage').textContent.includes('enviado com sucesso')")
 assert page.evaluate('window.mockCreateCalls')==1
 payload=page.evaluate('window.mockPayload');assert set(payload)=={'p_items','p_request_key','p_expected_total_cents'}
 assert payload['p_items'][0]['quantity']==2
 assert payload['p_items'][0]['note']=='Sem sal <script>bad()</script>'
 page.locator('#closeCart').click();assert 'Pedido recebido' in page.locator('#orderStatus').inner_text()
 page.evaluate("window.mockStatus='ready';document.dispatchEvent(new Event('visibilitychange'))")
 page.wait_for_function("document.getElementById('orderStatus').textContent.includes('Pronto')")
 page.eval_on_selector_all('img', '(imgs)=>Promise.all(imgs.map(img=>{img.loading="eager";return img.decode()}))')
 page.screenshot(path='/tmp/coffee-customer-cafe-mobile.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.goto(url+'/?t='+'b'*64)
 page.wait_for_function("document.getElementById('customerMessage').textContent.includes('outra mesa')")
 assert page.locator('button[data-add]:enabled').count()==0
 invalid=context.new_page();invalid.goto(url+'/?t='+'c'*64)
 invalid.wait_for_function("document.getElementById('customerMessage').textContent.includes('QR inválido')")
 # A new browser session is independently bound to table 02 in the mock API.
 context.clear_cookies();page.evaluate("localStorage.clear()")
 page.goto(url+'/?t='+'b'*64)
 page.wait_for_function("document.getElementById('tableLabel').textContent==='Mesa 02'")
 page.evaluate("localStorage.setItem('mock-expired','yes')")
 page.goto(url+'/?t='+'b'*64)
 page.locator('#newVisit').wait_for(state='visible')
 page.locator('#newVisit').click()
 page.wait_for_function("document.getElementById('tableLabel').textContent==='Mesa 02'")
 page.set_viewport_size({'width':1024,'height':768})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert page.locator('h2#title').inner_text()=='Cafeteria 1178'
 assert not errors,errors
 print('PASS: mobile UI, photos, approved price/phrase, cart/notes, double click, status, QR error/locked-session handling. Supabase mocked; server security not proven.')
 browser.close()
server.shutdown()
