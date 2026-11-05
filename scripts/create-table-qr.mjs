// Local/offline provisioning preparation. No database/network calls.
// Generated bearer URL is private; only SHA-256 is included in the SQL file.
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const [tableId,baseUrl,out='private-qr']=process.argv.slice(2);
if(!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(tableId||''))throw Error('Informe o UUID real da mesa.');
const base=new URL(baseUrl);
if(base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname)))throw Error('Use HTTPS.');
if(base.username||base.password)throw Error('Não inclua credenciais na URL.');
const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
const url=new URL('/pedido',base);url.searchParams.set('t',token);
const dir=resolve(out);await mkdir(dir,{recursive:true,mode:0o700});
const stem=resolve(dir,tableId);
await writeFile(stem+'.url.txt',url.href+'\n',{mode:0o600,flag:'wx'});
await writeFile(stem+'.sql',`-- Review and run only in approved staging first.\ninsert into customer_private.customer_table_tokens(table_id,token_hash) values ('${tableId}','${hash}');\n`,{mode:0o600,flag:'wx'});
console.log('Arquivos privados criados em '+dir+'. Não envie a URL para geradores de QR de terceiros. Gere/imprima o QR offline.');
