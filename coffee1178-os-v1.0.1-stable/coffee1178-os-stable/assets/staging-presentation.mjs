// Presentation only: no auth, cart, order, status or database operations.
const knownChrome='#netlify-badge,.netlify-badge,[data-netlify-badge],netlify-badge,#netlify-drawer,.netlify-drawer,netlify-drawer,#netlify-toolbar,.netlify-toolbar,netlify-toolbar,#netlify-cdp-container,iframe';
const candidates=knownChrome+',a[href],[id*="netlify" i],[class*="netlify" i]';
function hide(element){
 if(!element.classList.contains('coffee-netlify-hidden'))element.classList.add('coffee-netlify-hidden');
}
function appOwned(element){
 return element.matches('html,body,main,header,.bar,.overlay,.sheet') ||
  element.contains(document.getElementById('sendOrder')) || element.contains(document.getElementById('products'));
}
function officialNetlifyLink(element){
 try{const host=new URL(element.href,location.href).hostname;return host==='netlify.com'||host.endsWith('.netlify.com');}catch{return false;}
}
function hideHostingChrome(node){
 const root=node instanceof Element?node:node.parentElement;
 if(!root)return;
 for(const element of [root,...root.querySelectorAll(candidates)]){
  if(appOwned(element)||element.matches('script,style,link'))continue;
  let hosting=element.matches(knownChrome);
  if(element.tagName==='A' && officialNetlifyLink(element) && /powered\s*by\s*netlify/i.test(element.textContent))hosting=true;
  if(!hosting)continue;
  hide(element);
  // Remove the touch interception of an injected wrapper, not just its label.
  // Never hide a container that owns application content or the checkout button.
  for(let parent=element.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
   if(appOwned(parent))break;
   if(getComputedStyle(parent).position==='fixed')hide(parent);
  }
 }
}
hideHostingChrome(document.body);
new MutationObserver(records=>{
 for(const record of records){hideHostingChrome(record.target);for(const node of record.addedNodes)hideHostingChrome(node);}
}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src','href','title','id','class']});
// Follow the actual visible viewport, including the on-screen keyboard and zoom.
function updateVisibleViewport(){
 const v=window.visualViewport;
 document.documentElement.style.setProperty('--customer-visible-height',`${v?.height??window.innerHeight}px`);
 document.documentElement.style.setProperty('--customer-visible-top',`${v?.offsetTop??0}px`);
}
updateVisibleViewport();
window.addEventListener('resize',updateVisibleViewport,{passive:true});
window.visualViewport?.addEventListener('resize',updateVisibleViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',updateVisibleViewport,{passive:true});
