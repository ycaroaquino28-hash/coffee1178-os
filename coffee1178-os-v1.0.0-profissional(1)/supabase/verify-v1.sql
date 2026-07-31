-- Coffee 1178 OS v1.0 — verificação rápida
-- Execute apenas se o app informar ausência de alguma função/tabela.

select
  to_regclass('public.cafe_tables') as cafe_tables,
  to_regclass('public.products') as products,
  to_regclass('public.orders') as orders,
  to_regclass('public.order_items') as order_items,
  to_regclass('public.payments') as payments,
  to_regclass('public.audit_log') as audit_log;

select routine_name
from information_schema.routines
where routine_schema='public'
and routine_name in (
  'current_operator','verify_operator_pin','operator_logout','create_order',
  'set_order_status','cancel_order','request_table_closing','close_table_with_payment'
)
order by routine_name;
