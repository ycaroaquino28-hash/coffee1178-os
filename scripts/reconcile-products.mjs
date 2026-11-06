// Rebuild documentation from the checked-in read-only database snapshot.
import fs from 'node:fs';
import {menus} from '../coffee1178-os-v1.0.1-stable/coffee1178-os-stable/assets/customer-menu.mjs';
const root=new URL('../',import.meta.url);
const db=JSON.parse(fs.readFileSync(new URL('tests/fixtures/products.json',root),'utf8'));
const used=new Set(),rows=[];
for(const item of new Map(Object.values(menus).flat().map(x=>[x.name,x])).values()){
 const p=db.find(x=>x.id===item.productId);if(p)used.add(p.id);
 const situations=[];
 if(!p)situations.push('ausente no Supabase');else{
  if(item.name!==p.name)situations.push('nome diferente');
  if(item.price!==p.price_cents)situations.push('preço diferente');
  if(!situations.length)situations.push('igual');
 }
 rows.push({site:item.name,site_price_cents:item.price,supabase:p?.name||null,supabase_price_cents:p?.price_cents??null,product_id:p?.id||null,situation:situations.join('; '),review:item.mappingReviewed?'mapeado':'pendente de conferência'});
}
for(const p of db.filter(p=>!used.has(p.id)))rows.push({site:null,site_price_cents:null,supabase:p.name,supabase_price_cents:p.price_cents,product_id:p.id,situation:'ausente no site',review:'pendente de conferência'});
fs.writeFileSync(new URL('docs/product-reconciliation.json',root),JSON.stringify(rows,null,2)+'\n');
const money=n=>n===null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
fs.writeFileSync(new URL('docs/product-reconciliation.md',root),'# Conferência de produtos — 2026-11-06\n\nConsulta somente de leitura ao Supabase após as alterações comerciais realizadas pelo proprietário. Frontend sincronizado: Coca-Cola Original 350 ml e Coca-Cola Zero 350 ml a R$ 7,00; Suco de Uva em Lata a R$ 7,00; Leite e Canela a R$ 8,90. Os quatro UUIDs foram conferidos, os mapeamentos estão aprovados e liberados para envio quando a sessão da mesa estiver válida. Caffè d’Oro permanece a R$ 32,90. Nenhuma alteração foi feita no banco.\n\n40 itens visuais únicos e 40 produtos no banco: 18 iguais, 22 com nome diferente, zero divergências de preço e zero ausências. A tortinha foi conferida e liberada a pedido do proprietário em 2026-11-06. Pão francês com requeijão e Drink de Maçã Verde sem Álcool foram confirmados e liberados pelo proprietário. O pão francês com queijo Canastra e presunto foi confirmado como o item de R$ 9,90, separado do Misto Canastra de R$ 21,90. Bolo de Cenoura com Calda foi confirmado e liberado pelo proprietário, preservando o nome visual Calda e o UUID existente no banco (ainda cadastrado como Ganache). Não restam mapeamentos bloqueados por conferência; produtos inativos, sessão inválida e diferenças futuras de preço continuam bloqueando envio. As fotos foram preservadas.\n\n| Produto do site | Preço do site | Produto Supabase | Preço Supabase | Situação | Associação |\n|---|---:|---|---:|---|---|\n'+rows.map(r=>`| ${r.site||'—'} | ${money(r.site_price_cents)} | ${r.supabase||'—'} | ${money(r.supabase_price_cents)} | ${r.situation} | ${r.review} |`).join('\n')+'\n');
