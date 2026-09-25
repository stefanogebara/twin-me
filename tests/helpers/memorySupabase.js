/**
 * A few Supabase tables in memory, for a test in which a write and the read after it must meet:
 * the calendar connection written by the money API and read back by the token service.
 *
 * select, insert, update, upsert (merged on its conflict keys, as PostgREST merges duplicates:
 * a column the payload leaves out keeps its value), delete; filtered with eq, not-is-null, gte,
 * lt, in, contains and limit; ended with maybeSingle, single or an await. Every query is
 * recorded in `calls`; `fail(table, op)` makes one kind of query answer an error.
 *
 * `memoryDb` is one shared instance: a vi.mock factory imports this module and hands out
 * `memoryDb.client`, and the test imports the same module to seed and inspect it.
 */
export function memorySupabase() {
  const tables = new Map();
  const calls = [];
  const failures = new Map();
  let serial = 0;
  const rowsOf = (table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };

  function from(table) {
    const q = { table, op: 'select', filters: [], payload: undefined, options: undefined, columns: '*', limit: null };
    const matches = (row) => q.filters.every(([kind, column, value, extra]) => {
      if (kind === 'eq') return row[column] === value;
      if (kind === 'not') return value === 'is' && extra === null ? row[column] != null : row[column] !== extra;
      if (kind === 'gte') return row[column] >= value;
      if (kind === 'lt') return row[column] < value;
      if (kind === 'in') return value.includes(row[column]);
      if (kind === 'contains') return Object.entries(value).every(([k, v]) => row[column]?.[k] === v);
      return true;
    });
    const execute = (single) => {
      calls.push({ ...q, single });
      const failure = failures.get(`${table}:${q.op}`);
      if (failure) return { data: null, error: { message: failure } };
      const rows = rowsOf(table);
      if (q.op === 'select') {
        let found = rows.filter(matches).map((r) => ({ ...r }));
        if (q.limit != null) found = found.slice(0, q.limit);
        if (single === 'maybe') return { data: found[0] ?? null, error: null };
        if (single === 'one') return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
        return { data: found, error: null };
      }
      if (q.op === 'insert') {
        for (const r of [].concat(q.payload)) rows.push({ id: `row-${++serial}`, ...r });
        return { data: null, error: null };
      }
      if (q.op === 'upsert') {
        const keys = String(q.options?.onConflict || 'id').split(',').map((k) => k.trim());
        for (const r of [].concat(q.payload)) {
          const same = rows.find((x) => keys.every((k) => x[k] === r[k]));
          if (same) Object.assign(same, r);
          else rows.push({ id: `row-${++serial}`, ...r });
        }
        return { data: null, error: null };
      }
      if (q.op === 'update') {
        for (const r of rows.filter(matches)) Object.assign(r, q.payload);
        return { data: null, error: null };
      }
      if (q.op === 'delete') {
        tables.set(table, rows.filter((r) => !matches(r)));
        return { data: null, error: null };
      }
      return { data: null, error: { message: `unsupported ${q.op}` } };
    };
    const api = {
      select(columns = '*') { if (q.op === 'select') q.columns = columns; return api; },
      insert(payload) { q.op = 'insert'; q.payload = payload; return api; },
      update(payload) { q.op = 'update'; q.payload = payload; return api; },
      upsert(payload, options) { q.op = 'upsert'; q.payload = payload; q.options = options; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(column, value) { q.filters.push(['eq', column, value]); return api; },
      not(column, operator, value) { q.filters.push(['not', column, operator, value]); return api; },
      gte(column, value) { q.filters.push(['gte', column, value]); return api; },
      lt(column, value) { q.filters.push(['lt', column, value]); return api; },
      in(column, values) { q.filters.push(['in', column, values]); return api; },
      contains(column, value) { q.filters.push(['contains', column, value]); return api; },
      order() { return api; },
      limit(n) { q.limit = n; return api; },
      maybeSingle() { return Promise.resolve(execute('maybe')); },
      single() { return Promise.resolve(execute('one')); },
      then(resolve, reject) { return Promise.resolve(execute(null)).then(resolve, reject); },
    };
    return api;
  }

  return {
    client: { from },
    calls,
    rows: rowsOf,
    seed(table, rows) { tables.set(table, rows.map((r) => ({ id: `row-${++serial}`, ...r }))); },
    fail(table, op, message = `${table} ${op} unavailable`) { failures.set(`${table}:${op}`, message); },
    reset() { tables.clear(); calls.length = 0; failures.clear(); },
  };
}

export const memoryDb = memorySupabase();
