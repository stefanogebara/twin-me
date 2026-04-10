-- TwinMe Supabase security regression checks.
-- Run with a privileged database connection, for example:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security/supa-security-regression.sql

begin;

do $$
declare
  violations text;
begin
  select string_agg(format('%I.%I via %I %s', table_schema, table_name, grantee, privilege_type), E'\n')
  into violations
  from information_schema.role_table_grants
  where table_schema in ('public', 'aio', 'restaurant')
    and grantee = 'anon'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  if violations is not null then
    raise exception 'anon has dangerous table-level DML grants:%', E'\n' || violations;
  end if;
end $$;

do $$
declare
  violations text;
begin
  select string_agg(format('%I.%I.%I via %I %s', table_schema, table_name, column_name, grantee, privilege_type), E'\n')
  into violations
  from information_schema.column_privileges
  where table_schema in ('public', 'aio', 'restaurant')
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
    and column_name ~* '(password|secret|key_hash|credential|access_token|refresh_token|encrypted|correct_answer|answer_data|invite_token|demo_token)';

  if violations is not null then
    raise exception 'client roles can access sensitive columns:%', E'\n' || violations;
  end if;
end $$;

do $$
declare
  violations text;
begin
  with client_table_grants as (
    select table_schema, table_name
    from information_schema.role_table_grants
    where table_schema in ('public', 'aio', 'restaurant')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
    union
    select table_schema, table_name
    from information_schema.column_privileges
    where table_schema in ('public', 'aio', 'restaurant')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
  )
  select string_agg(format('%I.%I has client grants but RLS is disabled', n.nspname, c.relname), E'\n')
  into violations
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join client_table_grants g on g.table_schema = n.nspname and g.table_name = c.relname
  where c.relkind in ('r', 'p')
    and n.nspname in ('public', 'aio', 'restaurant')
    and not c.relrowsecurity;

  if violations is not null then
    raise exception 'RLS-disabled base tables still have client grants:%', E'\n' || violations;
  end if;
end $$;

do $$
declare
  violations text;
begin
  select string_agg(format('%I.%I via %I %s', table_schema, table_name, grantee, privilege_type), E'\n')
  into violations
  from information_schema.role_table_grants
  where table_schema in ('public', 'aio', 'restaurant')
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');

  if violations is not null then
    raise exception 'client roles have high-risk table privileges:%', E'\n' || violations;
  end if;
end $$;

do $$
declare
  violations text;
begin
  with client_callable_definers as (
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args,
      r.rolname as grantee
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('authenticated')) as r(rolname)
    where n.nspname in ('public', 'aio', 'restaurant')
      and p.prosecdef
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  )
  select string_agg(format('%I.%I(%s) executable by %I', schema_name, function_name, args, grantee), E'\n')
  into violations
  from client_callable_definers
  where not (
    schema_name = 'public'
    and function_name = 'get_daily_memory_counts'
    and args = 'p_user_id uuid'
    and grantee = 'authenticated'
  );

  if violations is not null then
    raise exception 'unexpected client-callable SECURITY DEFINER functions:%', E'\n' || violations;
  end if;
end $$;

rollback;
