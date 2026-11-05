-- LOCAL DISPOSABLE DATABASE ONLY. Never run against a live Supabase project.
\set ON_ERROR_STOP on
DO $$begin
 if current_database() !~ '^coffee_customer_test' then raise exception 'Use a disposable database named coffee_customer_test...';end if;
end$$;
DO $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
end$$;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to authenticated;
grant execute on function auth.jwt(),auth.uid() to authenticated;
create type public.table_status as enum('free','occupied','awaiting_payment');
create type public.order_status as enum('sent','preparing','ready','delivered','closed','cancelled');
create table public.operators(id uuid primary key,name text not null);
create table public.operator_sessions(auth_user_id uuid references auth.users(id),operator_id uuid references operators(id));
alter table public.operator_sessions enable row level security;
create function public.session_operator_id() returns uuid language sql stable security definer set search_path='' as $$select operator_id from public.operator_sessions where auth_user_id=auth.uid()$$;
create table public.cafe_tables(id uuid primary key default gen_random_uuid(),number int unique,name text unique,status public.table_status not null default 'free',opened_by uuid references operators(id),opened_at timestamptz,updated_at timestamptz default now());
create table public.products(id uuid primary key,name text not null,price_cents int not null,active boolean default true);
create sequence public.order_number_seq;
create table public.orders(id uuid primary key default gen_random_uuid(),number bigint unique default nextval('order_number_seq'),table_id uuid not null references cafe_tables(id),status public.order_status default 'sent',total_cents int not null,created_by uuid not null references operators(id),created_by_name text not null,created_at timestamptz default now(),updated_at timestamptz default now(),closed_at timestamptz);
create table public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references orders(id),product_id uuid references products(id),product_name text not null,unit_price_cents int not null,quantity int not null check(quantity>0),note text);
alter table public.cafe_tables enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
-- Match inspected staff SELECT policies; do not open operational rows to customers.
create policy staff_tables on cafe_tables for select to authenticated using(public.session_operator_id() is not null);
create policy staff_products on products for select to authenticated using(public.session_operator_id() is not null);
create policy staff_orders on orders for select to authenticated using(public.session_operator_id() is not null);
create policy staff_items on order_items for select to authenticated using(public.session_operator_id() is not null);
grant select on cafe_tables,products,orders,order_items to authenticated;
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into operators values('00000000-0000-0000-0000-000000000004','Equipe teste');
insert into operator_sessions values('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004');
insert into cafe_tables(id,number,name) values('10000000-0000-0000-0000-000000000001',1,'Mesa 01'),('10000000-0000-0000-0000-000000000002',2,'Mesa 02');
insert into products values('20000000-0000-0000-0000-000000000001','Caffè d’Oro',3290,true),('20000000-0000-0000-0000-000000000002','Inativo',500,false);
\ir ../../supabase/proposals/customer_self_service.sql
\ir customer_security.sql
