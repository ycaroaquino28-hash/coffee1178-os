-- PREPARED MIGRATION — DO NOT APPLY TO PRODUCTION BEFORE STAGING VALIDATION.
-- Uses the inspected Coffee 1178 schema and pgcrypto already in extensions.
-- Kept outside migrations/: Supabase CLI is unavailable; register with
-- `supabase migration new customer_self_service` in a connected staging environment.
begin;

create schema customer_private;
revoke all on schema customer_private from public, anon, authenticated;
-- No LOGIN, no BYPASSRLS, and never granted to authenticated/anon/authenticator.
create role coffee_customer_rpc nologin noinherit nobypassrls;
grant coffee_customer_rpc to postgres;
grant usage on schema public, auth, extensions, customer_private to coffee_customer_rpc;
-- Temporarily needed to transfer function ownership; revoked below.
grant create on schema customer_private to coffee_customer_rpc;
grant execute on function auth.uid(), auth.jwt(), public.session_operator_id() to coffee_customer_rpc;
grant execute on function extensions.digest(text,text) to coffee_customer_rpc;

create table customer_private.customer_table_tokens (
 id uuid primary key default gen_random_uuid(),
 table_id uuid not null references public.cafe_tables(id),
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 expires_at timestamptz,
 unique(id,table_id)
);
create unique index customer_one_active_token_per_table on customer_private.customer_table_tokens(table_id) where active;
create table customer_private.customer_sessions (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid not null unique references auth.users(id),
 table_id uuid not null references public.cafe_tables(id),
 table_token_id uuid not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '4 hours',
 revoked_at timestamptz,
 foreign key(table_token_id,table_id) references customer_private.customer_table_tokens(id,table_id),
 unique(id,table_id)
);
alter table public.orders add column source text not null default 'staff';
alter table public.orders add column customer_session_id uuid;
alter table public.orders alter column created_by drop not null;
alter table public.orders add constraint orders_customer_session_table_fk
 foreign key(customer_session_id,table_id) references customer_private.customer_sessions(id,table_id);
alter table public.orders add constraint orders_source_consistency check (
 (source='staff' and created_by is not null and customer_session_id is null)
 or (source='customer' and created_by is null and customer_session_id is not null and created_by_name='Cliente')
);
create index orders_customer_session_created_idx on public.orders(customer_session_id,created_at desc)
 where customer_session_id is not null;
create table customer_private.customer_order_requests (
 session_id uuid not null references customer_private.customer_sessions(id),
 request_key uuid not null,
 payload jsonb not null,
 order_id uuid not null unique references public.orders(id),
 created_at timestamptz not null default now(),
 primary key(session_id,request_key)
);
create index customer_sessions_table_idx on customer_private.customer_sessions(table_id);
alter table customer_private.customer_table_tokens enable row level security;
alter table customer_private.customer_sessions enable row level security;
alter table customer_private.customer_order_requests enable row level security;
revoke all on all tables in schema customer_private from public,anon,authenticated;
grant select on customer_private.customer_table_tokens to coffee_customer_rpc;
grant select,insert on customer_private.customer_sessions to coffee_customer_rpc;
grant update(revoked_at) on customer_private.customer_sessions to coffee_customer_rpc;
grant select,insert on customer_private.customer_order_requests to coffee_customer_rpc;
create policy customer_api_tokens on customer_private.customer_table_tokens to coffee_customer_rpc using (true);
create policy customer_api_sessions on customer_private.customer_sessions to coffee_customer_rpc using (true) with check (true);
create policy customer_api_requests on customer_private.customer_order_requests to coffee_customer_rpc using (true) with check (true);
-- Only the dedicated, non-login function owner receives these permissions.
-- Existing staff policies/functions and grants remain unchanged.
grant select on public.cafe_tables,public.products,public.orders,public.order_items to coffee_customer_rpc;
grant insert on public.orders,public.order_items to coffee_customer_rpc;
grant update(total_cents) on public.orders to coffee_customer_rpc;
grant update(status,opened_at,updated_at) on public.cafe_tables to coffee_customer_rpc;
grant usage,select on sequence public.order_number_seq to coffee_customer_rpc;
create policy customer_api_tables_select on public.cafe_tables for select to coffee_customer_rpc using (true);
create policy customer_api_tables_update on public.cafe_tables for update to coffee_customer_rpc using (true) with check (true);
create policy customer_api_products on public.products for select to coffee_customer_rpc using (active is true);
create policy customer_api_orders on public.orders to coffee_customer_rpc using (source='customer') with check (source='customer' and created_by is null and customer_session_id is not null);
create policy customer_api_items on public.order_items to coffee_customer_rpc
 using (exists(select 1 from public.orders o where o.id=order_id and o.source='customer'))
 with check (exists(select 1 from public.orders o where o.id=order_id and o.source='customer'));

create function customer_private.require_customer() returns uuid
language plpgsql stable security invoker set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
    or public.session_operator_id() is not null then
   raise exception using errcode='P0001', message='CUSTOMER_AUTH_REQUIRED';
 end if;
 return u;
end $$;
create function customer_private.active_session() returns customer_private.customer_sessions
language plpgsql stable security invoker set search_path='' as $$
declare s customer_private.customer_sessions; u uuid:=customer_private.require_customer();
begin
 select cs.* into s from customer_private.customer_sessions cs
 join customer_private.customer_table_tokens t on t.id=cs.table_token_id and t.table_id=cs.table_id
 where cs.auth_user_id=u and cs.revoked_at is null and cs.expires_at>now()
 and t.active and (t.expires_at is null or t.expires_at>now());
 if not found then raise exception using errcode='P0001',message='CUSTOMER_SESSION_INVALID'; end if;
 return s;
end $$;

create function customer_private.start_session(p_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=customer_private.require_customer(); s customer_private.customer_sessions;
 t customer_private.customer_table_tokens; tb public.cafe_tables;
begin
 -- Serialize first binding for this auth.uid(), including concurrent different QRs.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,1178));
 if p_token is null then
   s:=customer_private.active_session();
 else
   if p_token !~ '^[0-9a-f]{64}$' then raise exception using message='CUSTOMER_QR_INVALID';end if;
   select * into t from customer_private.customer_table_tokens
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and active
    and (expires_at is null or expires_at>now());
   if not found then raise exception using message='CUSTOMER_QR_INVALID';end if;
   select * into tb from public.cafe_tables where id=t.table_id for update;
   if not found or tb.status::text='awaiting_payment' then raise exception using message='CUSTOMER_TABLE_UNAVAILABLE';end if;
   select * into s from customer_private.customer_sessions where auth_user_id=u for update;
   if found then
     if s.table_token_id<>t.id or s.table_id<>t.table_id then
       raise exception using message='CUSTOMER_TABLE_LOCKED';
     end if;
     s:=customer_private.active_session(); -- Never renew expired/revoked sessions implicitly.
   else
     insert into customer_private.customer_sessions(auth_user_id,table_id,table_token_id)
      values(u,t.table_id,t.id) returning * into s;
   end if;
 end if;
 select * into tb from public.cafe_tables where id=s.table_id;
 return jsonb_build_object('table_name',tb.name,'table_number',tb.number,'expires_at',s.expires_at);
end $$;

create function customer_private.menu() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform customer_private.active_session();
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price_cents',p.price_cents)
 order by p.name) from public.products p where p.active is true),'[]'::jsonb);
end $$;

create function customer_private.create_order(p_items jsonb,p_request_key uuid,p_expected_total_cents integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s customer_private.customer_sessions; locked customer_private.customer_sessions;
 tb public.cafe_tables; req customer_private.customer_order_requests; ord public.orders;
 it jsonb; p public.products; qty int; total bigint:=0; units int:=0; seen uuid[]:='{}';
 product_id uuid; product_rows jsonb:='[]'; n int;
begin
 s:=customer_private.active_session();
 -- Same lock order as table lifecycle: table first, then customer session.
 select * into tb from public.cafe_tables where id=s.table_id for update;
 select * into locked from customer_private.customer_sessions where id=s.id for update;
 s:=customer_private.active_session();
 -- Recheck revocation after acquiring the session/table locks.
 perform 1 from customer_private.customer_table_tokens where id=s.table_token_id and active
  and (expires_at is null or expires_at>now());
 if not found then raise exception using message='CUSTOMER_SESSION_INVALID';end if;
 if p_request_key is null then raise exception using message='CUSTOMER_REQUEST_INVALID';end if;
 select * into req from customer_private.customer_order_requests where session_id=s.id and request_key=p_request_key;
 if found then
   if req.payload is distinct from jsonb_build_object('items',p_items,'expected_total',p_expected_total_cents) then raise exception using message='CUSTOMER_IDEMPOTENCY_CONFLICT';end if;
   select * into ord from public.orders where id=req.order_id;
   return jsonb_build_object('id',ord.id,'number',ord.number,'total_cents',ord.total_cents);
 end if;
 if tb.status::text not in ('free','occupied') then raise exception using message='CUSTOMER_TABLE_UNAVAILABLE';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception using message='CUSTOMER_ITEMS_INVALID';end if;
 n:=jsonb_array_length(p_items);
 if n<1 or n>40 then raise exception using message='CUSTOMER_ITEMS_INVALID';end if;
 -- Bounded orders per session (row lock also serializes concurrent unique requests).
 if (select count(*) from customer_private.customer_order_requests where session_id=s.id)>=20 then
  raise exception using message='CUSTOMER_ORDER_LIMIT';end if;
 if exists(select 1 from customer_private.customer_order_requests where session_id=s.id and created_at>now()-interval '5 seconds') then
  raise exception using message='CUSTOMER_RATE_LIMIT';end if;
 for it in select value from jsonb_array_elements(p_items) loop
   if jsonb_typeof(it)<>'object' then raise exception using message='CUSTOMER_ITEMS_INVALID';end if;
   if exists(select 1 from jsonb_object_keys(it) k where k not in ('product_id','quantity','note'))
    or jsonb_typeof(it->'product_id') is distinct from 'string'
    or jsonb_typeof(it->'quantity') is distinct from 'number'
    or (it->>'quantity') !~ '^[1-9][0-9]?$'
    or (it ? 'note' and jsonb_typeof(it->'note') not in ('string','null'))
    or length(coalesce(it->>'note',''))>300 then raise exception using message='CUSTOMER_ITEMS_INVALID';end if;
   begin product_id:=(it->>'product_id')::uuid;
   exception when invalid_text_representation then raise exception using message='CUSTOMER_ITEMS_INVALID';end;
   if product_id=any(seen) then raise exception using message='CUSTOMER_ITEMS_INVALID';end if;
   seen:=array_append(seen,product_id);qty:=(it->>'quantity')::int;units:=units+qty;
   if units>100 then raise exception using message='CUSTOMER_ITEMS_INVALID';end if;
   select * into p from public.products where id=product_id and active is true;
   if not found or p.price_cents<0 then raise exception using message='CUSTOMER_PRODUCT_UNAVAILABLE';end if;
   total:=total+p.price_cents::bigint*qty;
   if total>2147483647 then raise exception using message='CUSTOMER_ITEMS_INVALID';end if;
   product_rows:=product_rows||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'price',p.price_cents,'quantity',qty,'note',nullif(btrim(it->>'note'),'')));
 end loop;
 -- Expected total is only a consent check, NEVER the source of prices.
 if p_expected_total_cents is null or total<>p_expected_total_cents then
  raise exception using message='CUSTOMER_PRICE_CHANGED';end if;
 insert into public.orders(table_id,status,total_cents,created_by,created_by_name,source,customer_session_id)
  values(s.table_id,'sent',total::int,null,'Cliente','customer',s.id) returning * into ord;
 for it in select value from jsonb_array_elements(product_rows) loop
  insert into public.order_items(order_id,product_id,product_name,unit_price_cents,quantity,note)
   values(ord.id,(it->>'id')::uuid,it->>'name',(it->>'price')::int,(it->>'quantity')::int,it->>'note');
 end loop;
 insert into customer_private.customer_order_requests(session_id,request_key,payload,order_id)
  values(s.id,p_request_key,jsonb_build_object('items',p_items,'expected_total',p_expected_total_cents),ord.id);
 update public.cafe_tables set status='occupied',opened_at=coalesce(opened_at,now()),updated_at=now() where id=s.table_id;
 return jsonb_build_object('id',ord.id,'number',ord.number,'total_cents',ord.total_cents);
end $$;

create function customer_private.my_orders() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s customer_private.customer_sessions:=customer_private.active_session();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'status',o.status,
 'total_cents',o.total_cents,'created_at',o.created_at,'items',coalesce((select jsonb_agg(jsonb_build_object(
 'name',i.product_name,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents,'note',i.note) order by i.id)
 from public.order_items i where i.order_id=o.id),'[]'::jsonb)) order by o.created_at desc)
 from (select * from public.orders where customer_session_id=s.id and source='customer'
 order by created_at desc limit 50) o),'[]'::jsonb);
end $$;

-- Invalidate customer sessions at table closing; never touch staff sessions.
-- Also abort a close racing with a new customer order rather than leaving a free
-- table with an unpaid order. Existing close RPC can be retried by staff.
create function customer_private.table_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status::text='free' and old.status is distinct from new.status then
  if exists(select 1 from public.orders where table_id=new.id and source='customer' and status::text not in ('closed','cancelled')) then
    raise exception using message='Mesa recebeu um pedido durante o fechamento. Atualize e tente novamente.';
  end if;
  update customer_private.customer_sessions set revoked_at=now() where table_id=new.id and revoked_at is null;
 end if;
 return new;
end $$;
create trigger customer_table_lifecycle before update of status on public.cafe_tables
 for each row execute function customer_private.table_lifecycle();

-- Public facade is INVOKER; only narrowly scoped private entrypoints are DEFINER.
create function public.start_customer_session(p_token text default null) returns jsonb
 language sql security invoker set search_path='' as $$select customer_private.start_session(p_token)$$;
create function public.get_customer_menu() returns jsonb
 language sql security invoker set search_path='' as $$select customer_private.menu()$$;
create function public.create_customer_order(p_items jsonb,p_request_key uuid,p_expected_total_cents integer) returns jsonb
 language sql security invoker set search_path='' as $$select customer_private.create_order(p_items,p_request_key,p_expected_total_cents)$$;
create function public.get_customer_orders() returns jsonb
 language sql security invoker set search_path='' as $$select customer_private.my_orders()$$;

alter function customer_private.require_customer() owner to coffee_customer_rpc;
alter function customer_private.active_session() owner to coffee_customer_rpc;
alter function customer_private.start_session(text) owner to coffee_customer_rpc;
alter function customer_private.menu() owner to coffee_customer_rpc;
alter function customer_private.create_order(jsonb,uuid,integer) owner to coffee_customer_rpc;
alter function customer_private.my_orders() owner to coffee_customer_rpc;
alter function customer_private.table_lifecycle() owner to coffee_customer_rpc;
revoke create on schema customer_private from coffee_customer_rpc;
revoke all on all functions in schema customer_private from public,anon,authenticated;
revoke all on function public.start_customer_session(text),public.get_customer_menu(),public.create_customer_order(jsonb,uuid,integer),public.get_customer_orders() from public,anon,authenticated;
grant usage on schema customer_private to authenticated;
grant execute on function customer_private.start_session(text),customer_private.menu(),customer_private.create_order(jsonb,uuid,integer),customer_private.my_orders() to authenticated;
grant execute on function public.start_customer_session(text),public.get_customer_menu(),public.create_customer_order(jsonb,uuid,integer),public.get_customer_orders() to authenticated;
-- customer_private must NOT be added to Supabase Exposed schemas or realtime.
notify pgrst, 'reload schema';
commit;
