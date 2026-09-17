/** Real disposable PostgreSQL behind the small Supabase interface used by ingestion.
 * Never point at an app database. The dedicated CI job creates this database afresh.
 */
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';

export function testPool() {
  const value = process.env.MONEY_TEST_DATABASE_URL;
  if (!value) throw new Error('MONEY_TEST_DATABASE_URL is required for Money persistence tests');
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !/^\/twinme_money_test(?:_[a-z0-9_]+)?$/.test(url.pathname)) {
    throw new Error('Money tests require a loopback twinme_money_test database');
  }
  return new pg.Pool({ connectionString: value, max: 5 });
}

export async function bootstrapMoney(pool, { forward = true } = {}) {
  await pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA IF NOT EXISTS auth;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.users (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  `);
  const archive = 'database/supabase/migrations';
  const archived = (await fs.readdir(archive)).filter((n) => /^202609.*money.*\.sql$/.test(n)).sort();
  for (const name of archived) await pool.query(await fs.readFile(path.join(archive, name), 'utf8'));
  if (forward) {
    const canonical = 'database/migrations';
    for (const name of (await fs.readdir(canonical)).filter((n) => /^20260917[0-9]*_money.*\.sql$/.test(n)).sort()) {
      await pool.query(await fs.readFile(path.join(canonical, name), 'utf8'));
    }
  }
}

const identifier = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
  return `"${name}"`;
};

/** Queries execute against real constraints and transactions, not arrays of fake rows. */
export function postgresSupabase(pool) {
  return {
    async rpc(name, args = {}) {
      try {
        const entries = Object.entries(args);
        const values = entries.map(([, value]) => Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : value);
        const params = entries.map(([key], i) => `${identifier(key)} => $${i + 1}`).join(', ');
        if (name === 'money_ledger_page') {
          const result = await pool.query(`SELECT to_jsonb(t) AS data FROM public.${identifier(name)}(${params}) t`, values);
          return { data: result.rows.map((r) => r.data), error: null };
        }
        const result = await pool.query(`SELECT public.${identifier(name)}(${params}) AS data`, values);
        return { data: result.rows[0]?.data, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      let action = 'select'; let input; let conflict; let one = false; let columns = '*';
      const filters = []; let order = ''; let limit = ''; let executed;
      const query = {
        select(value = '*') { columns = value; return query; },
        insert(value) { action = 'insert'; input = value; return query; },
        upsert(value, options = {}) { action = 'upsert'; input = value; conflict = options.onConflict; return query; },
        update(value) { action = 'update'; input = value; return query; },
        single() { one = true; return query; },
        maybeSingle() { one = true; return query; },
        eq(k, v) { filters.push([k, '=', v]); return query; },
        gte(k, v) { filters.push([k, '>=', v]); return query; },
        lte(k, v) { filters.push([k, '<=', v]); return query; },
        in(k, v) { filters.push([k, '= ANY', v]); return query; },
        order(k, options = {}) { order = ` ORDER BY ${identifier(k)} ${options.ascending === false ? 'DESC' : 'ASC'}`; return query; },
        limit(n) { limit = ` LIMIT ${Math.max(0, Number(n) | 0)}`; return query; },
        then(resolve, reject) {
          executed ??= (async () => {
            try {
              const values = [];
              const param = (value) => { values.push(value && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value); return `$${values.length}`; };
              const projection = columns === '*' ? '*' : columns.split(',').map((s) => identifier(s.trim())).join(', ');
              const where = () => filters.length ? ' WHERE ' + filters.map(([k, op, value]) => `${identifier(k)} ${op}${op === '= ANY' ? `(${param(value)})` : ` ${param(value)}`}`).join(' AND ') : '';
              let sql;
              if (action === 'select') sql = `SELECT ${projection} FROM public.${identifier(table)}${where()}${order}${limit}`;
              if (action === 'update') sql = `UPDATE public.${identifier(table)} SET ${Object.entries(input).map(([k,v]) => `${identifier(k)}=${param(v)}`).join(', ')}${where()} RETURNING ${projection}`;
              if (action === 'insert' || action === 'upsert') {
                const rows = Array.isArray(input) ? input : [input];
                const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
                sql = `INSERT INTO public.${identifier(table)} (${keys.map(identifier).join(', ')}) VALUES ${rows.map((r) => '(' + keys.map((k) => param(r[k] ?? null)).join(', ') + ')').join(', ')}`;
                if (action === 'upsert') sql += ` ON CONFLICT (${conflict.split(',').map(identifier).join(', ')}) DO UPDATE SET ${keys.map((k) => `${identifier(k)}=EXCLUDED.${identifier(k)}`).join(', ')}`;
                sql += ` RETURNING ${projection}`;
              }
              const result = await pool.query(sql, values);
              return { data: one ? result.rows[0] ?? null : result.rows, error: null };
            } catch (error) { return { data: null, error }; }
          })();
          return executed.then(resolve, reject);
        },
      };
      return query;
    },
  };
}
