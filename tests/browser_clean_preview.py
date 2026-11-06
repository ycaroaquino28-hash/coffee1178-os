"""Local UI integration test with mocked Supabase SDK; does not test real RLS/RPCs."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading, json, functools
from playwright.sync_api import sync_playwright
from PIL import Image
root = Path(__file__).resolve().parents[1]
site = root/'coffee1178-os-v1.0.1-stable/coffee1178-os-stable'
products = json.loads((root/'tests/fixtures/products.json').read_text())
policy="script-src 'self' https://cdn.jsdelivr.net; script-src-attr 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy',policy)
        super().end_headers()
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
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 context.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.COFFEE1178_CONFIG={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_KEY:'public-test-key'};"))
 context.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body=sdk,headers={'Access-Control-Allow-Origin':'*'}))
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url+'/pedido?t='+'a'*64)
 # Local SimpleHTTPRequestHandler does not implement Netlify's /pedido rewrite.
 if page.locator('#tableLabel').count()==0: page.goto(url+'/?t='+'a'*64)
 page.wait_for_function("() => document.getElementById('tableLabel').textContent==='Mesa 01'")
 assert '?t=' not in page.url
 assert page.locator('h2#title').inner_text()=='Cafeteria 1178'
 # Approved products are enabled in the live UI; unresolved associations stay disabled.
 for name in ['Coca-Cola Original 350 ml','Coca-Cola Zero 350 ml','Suco de Uva em Lata','Leite e Canela','Tortinha de Frango com Requeijão','Pão Francês na Chapa com Requeijão','Pão Francês na Chapa com Queijo Canastra e Presunto']:
  product=page.locator('article.product').filter(has=page.get_by_role('heading',name=name,exact=True))
  assert product.get_by_role('button',name='Adicionar +').is_enabled(),name
 for name in ['Bolo de Cenoura com Calda']:
  product=page.locator('article.product').filter(has=page.get_by_role('heading',name=name,exact=True))
  assert product.get_by_role('button',name='Adicionar +').is_enabled(),name
 page.get_by_role('button',name='Coffee & House',exact=True).click()
 assert page.locator('.tag').inner_text()=='ENTRE O CAFÉ E A NOITE'
 for width,height in [(320,568),(390,844),(844,390),(768,1024)]:
  page.set_viewport_size({'width':width,'height':height})
  page.locator('.hero').scroll_into_view_if_needed()
  page.locator('.hero').screenshot(path=f'/tmp/coffee-house-no-gray-{width}x{height}.png')
  im=Image.open(f'/tmp/coffee-house-no-gray-{width}x{height}.png').convert('RGB')
  # The former flat gray strip must not occur anywhere in the lower 20%.
  for y in range(int(im.height*.8),im.height):
   pixels=[im.getpixel((x,y)) for x in range(im.width)]
   gray=sum(1 for r,g,b in pixels if max(r,g,b)-min(r,g,b)<4 and 100<=r<=160)
   assert gray < len(pixels)*.8,(width,height,y,'gray stripe')
  assert page.locator('.hero').evaluate("e=>getComputedStyle(e).overflow==='hidden'")
 page.set_viewport_size({'width':390,'height':844})

 for name in ['Coca-Cola Original 350 ml','Coca-Cola Zero 350 ml','Suco de Uva em Lata']:
  product=page.locator('article.product').filter(has=page.get_by_role('heading',name=name,exact=True))
  assert product.get_by_role('button',name='Adicionar +').is_enabled(),name
 blocked=page.locator('article.product').filter(has=page.get_by_role('heading',name='Drink de Maçã Verde sem Álcool',exact=True))
 assert blocked.get_by_role('button',name='Adicionar +').is_enabled()
 assert 'gaseificado de maçã verde com especiarias, sem álcool' in blocked.inner_text()

 doro=page.locator('article.product').filter(has=page.get_by_role('heading',name='Caffè d’Oro',exact=True))
 assert '32,90' in doro.inner_text();assert doro.locator('img').count()==1
 gin=page.locator('article.product').filter(has=page.get_by_role('heading',name='Gin Tônica',exact=True))
 assert gin.locator('img').get_attribute('src')=='./assets/menu/gin-tonica.png'
 gin.locator('img').scroll_into_view_if_needed()
 page.wait_for_function("() => [...document.querySelectorAll('img')].filter(i=>i.alt==='Gin Tônica').every(i=>i.complete&&i.naturalWidth>0)")
 page.eval_on_selector_all('img', '(imgs)=>Promise.all(imgs.map(img=>{img.loading="eager";return img.decode()}))')
 page.screenshot(path='/tmp/coffee-customer-house-mobile.png',full_page=True)
 page.get_by_role('button',name='Cafeteria 1178',exact=True).click()
 tortinha=page.locator('article.product').filter(has=page.get_by_role('heading',name='Tortinha de Frango com Requeijão',exact=True))
 tortinha.get_by_role('button',name='Adicionar +').click()
 page.locator('#cartBtn').click()
 assert 'Tortinha de Frango com Requeijão' in page.locator('#cartItems').inner_text()
 assert '7,90' in page.locator('#cartTotal').inner_text()
 page.locator('[data-minus]').click()
 page.locator('#closeCart').click()
 item=page.locator('article.product').filter(has=page.get_by_role('heading',name='Croissant Canastra',exact=True))
 item.get_by_role('button',name='Adicionar +').click();item.get_by_role('button',name='Adicionar +').click()
 # Simulate a late hosting badge that previously covered the bottom CTA.
 page.evaluate("""()=>{const badge=document.createElement('div');badge.id='hosting-test-wrapper';badge.style.cssText='position:fixed;bottom:0;right:0;width:100vw;height:100vh;z-index:2147483647;background:red';badge.innerHTML='<a href="https://www.netlify.com/"><span>Powered by</span><span>Netlify</span></a>';document.body.append(badge);const drawer=document.createElement('netlify-drawer');drawer.style.cssText='position:fixed;inset:0;z-index:2147483647';document.body.append(drawer)}""")
 page.wait_for_function("() => getComputedStyle(document.getElementById('hosting-test-wrapper')).display==='none'")
 page.evaluate("""()=>{const frame=document.createElement('iframe');frame.id='anonymous-host-frame';frame.style.cssText='position:fixed;inset:0;z-index:2147483647';frame.src='about:blank';document.body.append(frame);const script=document.createElement('script');script.src='https://app.netlify.com/injected-toolbar.js';document.body.append(script)}""")
 page.wait_for_function("() => getComputedStyle(document.getElementById('anonymous-host-frame')).display==='none'")

 page.locator('#cartBtn').click();page.locator('textarea').fill('Sem sal <script>bad()</script>')
 for width,height in [(320,568),(390,844),(844,390),(390,360)]:
  page.set_viewport_size({'width':width,'height':height})
  page.wait_for_timeout(50)
  assert page.locator('#sendOrder').evaluate("""e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&[.1,.5,.9].every(x=>[.1,.5,.9].every(y=>document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)===e))}"""),(width,height)
 page.set_viewport_size({'width':390,'height':844})

 assert '39,80' in page.locator('#cartTotal').inner_text()
 page.evaluate("document.getElementById('sendOrder').click();document.getElementById('sendOrder').click()")
 page.wait_for_function("() => document.getElementById('sendMessage').textContent.includes('enviado com sucesso')")
 assert page.evaluate('window.mockCreateCalls')==1
 payload=page.evaluate('window.mockPayload');assert set(payload)=={'p_items','p_request_key','p_expected_total_cents'}
 assert payload['p_items'][0]['quantity']==2
 assert payload['p_items'][0]['note']=='Sem sal <script>bad()</script>'
 page.locator('#closeCart').click();assert 'Pedido recebido' in page.locator('#orderStatus').inner_text()
 page.evaluate("window.mockStatus='ready';document.dispatchEvent(new Event('visibilitychange'))")
 page.wait_for_function("() => document.getElementById('orderStatus').textContent.includes('Pronto')")
 page.eval_on_selector_all('img', '(imgs)=>Promise.all(imgs.map(img=>{img.loading="eager";return img.decode()}))')
 page.screenshot(path='/tmp/coffee-customer-cafe-mobile.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.goto(url+'/?t='+'b'*64)
 page.wait_for_function("() => document.getElementById('customerMessage').textContent.includes('outra mesa')")
 assert page.locator('button[data-add]:enabled').count()==0
 invalid=context.new_page();invalid.goto(url+'/?t='+'c'*64)
 invalid.wait_for_function("() => document.getElementById('customerMessage').textContent.includes('QR inválido')")
 # A new browser session is independently bound to table 02 in the mock API.
 context.clear_cookies();page.evaluate("localStorage.clear()")
 page.goto(url+'/?t='+'b'*64)
 page.wait_for_function("() => document.getElementById('tableLabel').textContent==='Mesa 02'")
 page.evaluate("localStorage.setItem('mock-expired','yes')")
 page.goto(url+'/?t='+'b'*64)
 page.locator('#newVisit').wait_for(state='visible')
 page.locator('#newVisit').click()
 page.wait_for_function("() => document.getElementById('tableLabel').textContent==='Mesa 02'")
 page.set_viewport_size({'width':1024,'height':768})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert page.locator('h2#title').inner_text()=='Cafeteria 1178'
 # Long cart: own fixed footer must not intercept any point of the send button.
 page.set_viewport_size({'width':320,'height':568})
 for button in page.locator('button[data-add]:enabled').all()[:10]:button.click()
 page.locator('#cartBtn').click()
 page.wait_for_timeout(50)
 assert page.locator('#sendOrder').evaluate("""e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&[.1,.5,.9].every(x=>[.1,.5,.9].every(y=>document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)===e))}""")
 assert page.locator('.bar').evaluate("e=>getComputedStyle(e).visibility==='hidden'")
 assert page.locator('#cartItems').evaluate("e=>getComputedStyle(e).overflowY==='auto' && e.scrollHeight>e.clientHeight")
 page.locator('#cartItems').evaluate('e=>e.scrollTop=e.scrollHeight')
 assert page.locator('#sendOrder').evaluate("""e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&[.1,.5,.9].every(x=>[.1,.5,.9].every(y=>document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)===e))}""")
 page.screenshot(path='/tmp/coffee-clean-mobile-cart.png')
 assert not errors,errors
 print('PASS: touch/mobile portrait/landscape/reduced viewport; no gray strip; fixed grid checkout fully hit-testable; long cart, injected badge/drawer/frame blocked; CSP active. Supabase mocked.')
 browser.close()
server.shutdown()
