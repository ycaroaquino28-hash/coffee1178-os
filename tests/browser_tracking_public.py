"""Read-only checks of the published preview. No QR, sign-in, RPC or order writes."""
import os,sys
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
url=sys.argv[1] if len(sys.argv)>1 else 'https://coffee1178-autoatendimento-preview.netlify.app/'
if 't' in parse_qs(urlparse(url).query):raise ValueError('This static check must not receive a table token.')
with sync_playwright() as p:
 proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'],proxy={'server':proxy} if proxy else None)
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 response=page.goto(url,wait_until='networkidle',timeout=60000)
 assert response.status==200,response.status
 page.wait_for_function("() => document.getElementById('customerMessage').textContent.includes('Escaneie o QR')",timeout=30000)
 assert page.evaluate("() => window.COFFEE1178_CONFIG.SUPABASE_URL")=='https://qjeosulasnnafpnwgimu.supabase.co'
 page.get_by_role('button',name='Coffee & House',exact=True).click()
 assert page.locator('.tag').inner_text()=='ENTRE O CAFÉ E A NOITE'
 assert page.locator('button[data-add]:enabled').count()==0 # no QR/session: preserve authorization gate
 result=page.evaluate("""async()=>{const m=await import('/assets/customer-tracking.mjs?v=tracking-20261106-01');return {interval:m.POLL_INTERVAL_MS,html:m.renderOrderTracking({id:'test',number:1,status:'ready',total_cents:300,items:[{name:'Café Tradicional',quantity:1}]})}}""")
 assert result['interval']==5000
 assert 'Pronto para servir' in result['html'] and 'aria-current="step"' in result['html']
 assert not errors,errors
 print('PASS PUBLIC HTTP 200; scripts/CSS and tracking module load without JS exceptions; staging URL; QR gate intact. No authenticated live order/status test performed.')
 browser.close()
