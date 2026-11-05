-- Run only through bootstrap.sql in an empty disposable database.
insert into customer_private.customer_table_tokens(table_id,token_hash) values
 ('10000000-0000-0000-0000-000000000001',encode(extensions.digest(repeat('a',64),'sha256'),'hex')),
 ('10000000-0000-0000-0000-000000000002',encode(extensions.digest(repeat('b',64),'sha256'),'hex'));
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","is_anonymous":true}',false);
DO $$declare x jsonb;y jsonb;
begin
 begin perform public.start_customer_session(repeat('c',64));raise exception 'FAIL invalid token accepted';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_QR_INVALID' then raise;end if;end;
 x:=public.start_customer_session(repeat('a',64));
 if x->>'table_number'<>'1' then raise exception 'FAIL wrong table';end if;
 begin perform public.start_customer_session(repeat('b',64));raise exception 'FAIL table switching accepted';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_TABLE_LOCKED' then raise;end if;end;
 if exists(select 1 from public.orders) or exists(select 1 from public.cafe_tables) or exists(select 1 from public.order_items) then raise exception 'FAIL direct row leak';end if;
 if has_table_privilege('authenticated','customer_private.customer_sessions','SELECT') then raise exception 'FAIL session select granted';end if;
 if has_function_privilege('anon','public.create_customer_order(jsonb,uuid,integer)','EXECUTE') then raise exception 'FAIL anonymous role RPC grant';end if;
 begin perform public.create_customer_order('[{"product_id":"20000000-0000-0000-0000-000000000002","quantity":1}]','30000000-0000-0000-0000-000000000001',6580);raise exception 'FAIL inactive accepted';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_PRODUCT_UNAVAILABLE' then raise;end if;end;
 begin perform public.create_customer_order('[{"product_id":"20000000-0000-0000-0000-000000000001","quantity":0}]','30000000-0000-0000-0000-000000000001',6580);raise exception 'FAIL zero accepted';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_ITEMS_INVALID' then raise;end if;end;
 begin perform public.create_customer_order('[{"product_id":"20000000-0000-0000-0000-000000000001","quantity":1,"price_cents":1}]','30000000-0000-0000-0000-000000000001',6580);raise exception 'FAIL browser price accepted';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_ITEMS_INVALID' then raise;end if;end;
 begin perform public.create_customer_order('[{"product_id":"20000000-0000-0000-0000-000000000001","quantity":2}]','30000000-0000-0000-0000-000000000001',1);raise exception 'FAIL wrong total accepted';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_PRICE_CHANGED' then raise;end if;end;
 x:=public.create_customer_order('[{"product_id":"20000000-0000-0000-0000-000000000001","quantity":2,"note":"Sem açúcar"}]','30000000-0000-0000-0000-000000000001',6580);
 y:=public.create_customer_order('[{"product_id":"20000000-0000-0000-0000-000000000001","quantity":2,"note":"Sem açúcar"}]','30000000-0000-0000-0000-000000000001',6580);
 if x->>'id'<>y->>'id' or (x->>'total_cents')::int<>6580 then raise exception 'FAIL idempotency/pricing';end if;
 if jsonb_array_length(public.get_customer_orders())<>1 then raise exception 'FAIL order count';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","is_anonymous":true}',false);
DO $$begin
 perform public.start_customer_session(repeat('b',64));
 if jsonb_array_length(public.get_customer_orders())<>0 then raise exception 'FAIL another customer order leaked';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","is_anonymous":true}',false);
DO $$begin
 begin perform public.start_customer_session(repeat('a',64));raise exception 'FAIL operator accepted';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_AUTH_REQUIRED' then raise;end if;end;
 -- Existing staff SELECT policies continue to see customer orders.
 if (select count(*) from public.orders)<>1 then raise exception 'FAIL staff cannot see customer order';end if;
end$$;
reset role;
DO $$begin
 if not exists(select 1 from public.orders where source='customer' and created_by is null and created_by_name='Cliente' and status='sent' and total_cents=6580) then raise exception 'FAIL order fields';end if;
 if (select status from public.cafe_tables where number=1)<>'occupied' then raise exception 'FAIL table not occupied';end if;
end$$;
-- Simulate staff status transitions and final closing; existing OS RPCs require
-- separate end-to-end tests against a staging clone with all operational tables.
update public.orders set status='ready';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","is_anonymous":true}',false);
DO $$begin
 if public.get_customer_orders()->0->>'status'<>'ready' then raise exception 'FAIL status visibility';end if;
end$$;
reset role;
update public.orders set status='closed';
update public.cafe_tables set status='free' where number=1;
set role authenticated;
DO $$begin
 begin perform public.get_customer_orders();raise exception 'FAIL closed visit remains active';
 exception when raise_exception then if sqlerrm<>'CUSTOMER_SESSION_INVALID' then raise;end if;end;
end$$;
reset role;
select 'PASS customer SQL security smoke tests' as result;
