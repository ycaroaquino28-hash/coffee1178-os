// A saved authenticated session must never select a table on the public menu.
// /pedido is the explicit ordering area; legacy QR links with ?t= remain valid.
export function isOrderingEntry(pathname,search=''){
 return pathname.replace(/\/+$/,'')==='/pedido'||new URLSearchParams(search).has('t');
}
