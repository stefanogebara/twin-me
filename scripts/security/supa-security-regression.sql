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
  with service_managed_tables as (
    select *
    from (values
      ('public', 'user_wiki_pages'),
      ('public', 'user_wiki_logs')
    ) as v(table_schema, table_name)
  )
  select string_agg(format('%I.%I via %I %s', g.table_schema, g.table_name, g.grantee, g.privilege_type), E'\n')
  into violations
  from information_schema.role_table_grants g
  join service_managed_tables t on t.table_schema = g.table_schema and t.table_name = g.table_name
  where g.grantee in ('anon', 'authenticated')
    and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  if violations is not null then
    raise exception 'service-managed wiki tables have client write grants:%', E'\n' || violations;
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
  with protected_rpcs as (
    select *
    from (values
      ('public', 'generate_llm_system_prompt'),
      ('public', 'get_behavioral_summary'),
      ('public', 'get_platform_stats'),
      ('public', 'get_style_summary'),
      ('public', 'match_wiki_pages')
    ) as v(schema_name, function_name)
  ),
  client_callable_protected_rpcs as (
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args,
      r.rolname as grantee
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join protected_rpcs pr on pr.schema_name = n.nspname and pr.function_name = p.proname
    cross join (values ('anon'), ('authenticated')) as r(rolname)
    where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
  )
  select string_agg(format('%I.%I(%s) executable by %I', schema_name, function_name, args, grantee), E'\n')
  into violations
  from client_callable_protected_rpcs;

  if violations is not null then
    raise exception 'service-only RPCs became client-callable:%', E'\n' || violations;
  end if;
end $$;

do $$
declare
  violations text;
begin
  with expanded_policies as (
    select
      p.schemaname,
      p.tablename,
      p.policyname,
      policy_role.role_name,
      cmd_name.cmd
    from pg_policies p
    cross join lateral unnest(coalesce(p.roles, array['public']::name[])) as policy_role(role_name)
    cross join lateral unnest(
      case
        when p.cmd = 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
        else array[p.cmd]::text[]
      end
    ) as cmd_name(cmd)
    where p.schemaname in ('public', 'aio', 'restaurant')
      and p.permissive = 'PERMISSIVE'
  ),
  duplicate_permissive_policies as (
    select
      schemaname,
      tablename,
      role_name::text as role_name,
      cmd,
      array_agg(policyname order by policyname) as policy_names
    from expanded_policies
    group by schemaname, tablename, role_name, cmd
    having count(*) > 1
  )
  select string_agg(
    format(
      '%I.%I role=%s cmd=%s policies=[%s]',
      schemaname,
      tablename,
      role_name,
      cmd,
      array_to_string(policy_names, ', ')
    ),
    E'\n'
  )
  into violations
  from duplicate_permissive_policies;

  if violations is not null then
    raise exception 'duplicate permissive RLS policies detected:%', E'\n' || violations;
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
