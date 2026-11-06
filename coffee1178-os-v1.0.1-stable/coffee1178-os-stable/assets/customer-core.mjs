export const MAX_QUANTITY = 99;
export const MAX_UNITS = 100;
export const MAX_LINES = 40;
export const MAX_NOTE = 300;
export const money = cents => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(cents/100);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function availability(item, catalog, connected) {
  if (!connected) return {ok:false, reason:'Leia o QR da mesa para pedir.'};
  const real = catalog.find(p => p.id === item.productId);
  if (!item.mappingReviewed || !item.productId) return {ok:false, reason:'Item em conferência. Consulte a equipe.'};
  if (!real) return {ok:false, reason:'Indisponível no momento.'};
  if (real.price_cents !== item.price) return {ok:false, reason:'Preço em conferência. Consulte a equipe.'};
  return {ok:true};
}
export function buildItems(cart) {
  const entries = Object.entries(cart).sort(([a],[b])=>a.localeCompare(b));
  if (!entries.length || entries.length > MAX_LINES) throw new Error('Confira os itens do carrinho.');
  let count = 0;
  return entries.map(([product_id, item]) => {
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(product_id) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY ||
        typeof item.note !== 'string' || [...item.note].length > MAX_NOTE) throw new Error('Quantidade ou observação inválida.');
    count += item.quantity;
    if (count > MAX_UNITS) throw new Error('Limite de 100 unidades por pedido.');
    // Neither table, price, user nor session ID is accepted from the UI.
    return {product_id, quantity:item.quantity, note:item.note.trim() || null};
  });
}
export class OrderSender {
  constructor({rpc, storage, storageKey, uuid = ()=>crypto.randomUUID()}) {
    this.rpc=rpc;this.storage=storage;this.storageKey=storageKey;this.uuid=uuid;
    this.busy=false;this.pending=null;
    try { this.pending=JSON.parse(storage.getItem(storageKey)||'null'); } catch { /* bad local state cannot authorize anything */ }
    if (this.pending && (!Array.isArray(this.pending.items) || typeof this.pending.key!=='string')) this.pending=null;
  }
  async send(cart, expectedTotal) {
    if (this.busy) throw new Error('O pedido já está sendo enviado.');
    this.busy=true;
    try {
      const items=buildItems(cart);
      if (!Number.isSafeInteger(expectedTotal) || expectedTotal<0) throw new Error('Total inválido.');
      if (this.pending && (JSON.stringify(this.pending.items)!==JSON.stringify(items) || this.pending.expectedTotal!==expectedTotal)) {
        throw new Error('Confirme o resultado do envio anterior antes de alterar o pedido.');
      }
      if (!this.pending) {
        const pending={key:this.uuid(),items,expectedTotal};
        // Persist before the network request; fail closed if storage is unavailable.
        this.storage.setItem(this.storageKey,JSON.stringify(pending));
        this.pending=pending;
      }
      const {data,error}=await this.rpc('create_customer_order',{p_items:this.pending.items,p_request_key:this.pending.key,p_expected_total_cents:this.pending.expectedTotal});
      if (error) {
        // Only explicit transactional rejections prove no order was created.
        if (error.code==='P0001' && ['CUSTOMER_PRODUCT_UNAVAILABLE','CUSTOMER_ITEMS_INVALID','CUSTOMER_REQUEST_INVALID','CUSTOMER_PRICE_CHANGED'].includes(error.message)) {
          this.storage.removeItem(this.storageKey);this.pending=null;
        }
        throw error;
      }
      if (!data?.id || !Number.isSafeInteger(data.total_cents)) throw new Error('Resposta do pedido não confirmada. Tente novamente.');
      this.storage.removeItem(this.storageKey);this.pending=null;
      return data;
    } finally {this.busy=false;}
  }
}
export const statusLabel = status => ({sent:'Pedido recebido',preparing:'Preparando',ready:'Pronto para servir',delivered:'Entregue',closed:'Finalizado',cancelled:'Cancelado'}[status] || 'Atualizando');
