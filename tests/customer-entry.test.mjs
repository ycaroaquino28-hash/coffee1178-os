import test from 'node:test';
import assert from 'node:assert/strict';
import {isOrderingEntry} from '../coffee1178-os-v1.0.1-stable/coffee1178-os-stable/assets/customer-entry.mjs';
test('public bio URL never selects ordering mode, including marketing/table-number parameters',()=>{
 for(const path of ['/','/cardapio','/produtos'])for(const query of ['','?utm_source=instagram','?mesa=2','?table_id=2'])assert.equal(isOrderingEntry(path,query),false);
});
test('only the explicit ordering route or a QR token enables the existing validation flow',()=>{
 assert.equal(isOrderingEntry('/pedido'),true);assert.equal(isOrderingEntry('/pedido/'),true);
 assert.equal(isOrderingEntry('/','?t='+'a'.repeat(64)),true);
 assert.equal(isOrderingEntry('/pedido-falso'),false);
 // This determines the UI entry only: existing token/auth/RPC validation is still mandatory.
 assert.equal(isOrderingEntry('/','?t=invalid'),true);
});
