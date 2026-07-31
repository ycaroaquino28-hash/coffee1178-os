export const money = cents =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);

export const minutesSince = iso =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

export const roleLabel = role => ({
  admin: "Administrador",
  waiter: "Garçom",
  kitchen: "Cozinha",
  cashier: "Caixa"
}[role] || role);

export const statusLabel = status => ({
  sent: "Novo",
  preparing: "Preparando",
  ready: "Pronto",
  delivered: "Entregue",
  closed: "Fechado",
  cancelled: "Cancelado"
}[status] || status);
