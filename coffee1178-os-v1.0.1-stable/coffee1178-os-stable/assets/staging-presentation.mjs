// Presentation only. No cart, auth, RPC, order or status interactions.
const hostingSelector = '#netlify-badge,.netlify-badge,[data-netlify-badge],netlify-badge,#netlify-drawer,.netlify-drawer,netlify-drawer,#netlify-toolbar,.netlify-toolbar,netlify-toolbar,#netlify-cdp-container,iframe';
function hideHostingChrome(root) {
 if (!(root instanceof Element)) return;
 const candidates = [root,...root.querySelectorAll(hostingSelector+',a[href]')];
 for (const element of candidates) {
  if (element.matches('html,body,main,header,script,style')) continue;
  let hide = element.matches(hostingSelector) && element.tagName!=='IFRAME';
  if (element.tagName==='IFRAME') {
   try { const host=new URL(element.src,location.href).hostname;hide=host==='netlify.com'||host.endsWith('.netlify.com'); } catch {}
  }
  if (element.tagName==='A' && /^powered\s+by\s+netlify$/i.test(element.textContent.trim())) {
   try {
    const host=new URL(element.href,location.href).hostname;
    if(host==='netlify.com'||host.endsWith('.netlify.com')) {
     hide=true;
     let parent=element.parentElement;
     while(parent && parent!==document.body){
      const rect=parent.getBoundingClientRect();
      if(getComputedStyle(parent).position==='fixed' && rect.height<=200 && rect.width<=600){parent.classList.add('coffee-netlify-hidden');break;}
      parent=parent.parentElement;
     }
    }
   } catch {}
  }
  if(hide)element.classList.add('coffee-netlify-hidden');
 }
}
hideHostingChrome(document.body);
new MutationObserver(records=>{
 for(const record of records){hideHostingChrome(record.target);for(const node of record.addedNodes)hideHostingChrome(node);}
}).observe(document.body,{childList:true,subtree:true});
