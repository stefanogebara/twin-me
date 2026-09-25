/**
 * An in-memory stand-in for the part of the Supabase query builder the money store uses, so a
 * test can run two ledgers against one set of tables and see every write either of them made.
 *
 * Not a database: a table is an array of rows and a filter is a predicate. What it does keep
 * from Postgres is what a cross-account test needs to be honest: primary keys (a second insert
 * of the same key fails with 23505), NOT NULL columns, column defaults, upsert with
 * onConflict / ignoreDuplicates, and the projection a select asked for (a reader that uses a
 * column it never selected gets undefined, as it would from PostgREST).
 */

const copy = (row) => JSON.parse(JSON.stringify(row));

/**
 * @param {Record<string, { key?: string[], notNull?: string[], defaults?: Record<string, unknown> }>} schema
 */
export function memorySupabase(schema = {}) {
  const tables = new Map();
  /** Every write, in order: { table, action, rows }. */
  const writes = [];
  const rowsOf = (name) => { if (!tables.has(name)) tables.set(name, []); return tables.get(name); };
  const specOf = (name) => schema[name] || {};

  const fail = (code, message) => ({ data: null, error: { code, message } });
  const sameKey = (spec, a, b) => (spec.key || []).length > 0 && spec.key.every((k) => a[k] === b[k]);
  const missing = (spec, row) => (spec.notNull || []).find((k) => row[k] === null || row[k] === undefined);
  const withDefaults = (spec, row) => ({ ...(spec.defaults || {}), ...row });

  function from(name) {
    let action = 'select';
    let input = null;
    let options = {};
    let columns = '*';
    let one = null;
    let limitN = null;
    let orderBy = null;
    const filters = [];

    const project = (row) => {
      if (columns === '*') return copy(row);
      const out = {};
      for (const col of columns.split(',').map((c) => c.trim()).filter(Boolean)) out[col] = row[col] === undefined ? null : copy({ v: row[col] }).v;
      return out;
    };
    const matches = (row) => filters.every((f) => f(row));

    function run() {
      const spec = specOf(name);
      const rows = rowsOf(name);
      if (action === 'insert' || action === 'upsert') {
        const given = (Array.isArray(input) ? input : [input]).map(copy);
        const conflictCols = action === 'upsert' && options.onConflict ? options.onConflict.split(',').map((c) => c.trim()) : spec.key;
        const clash = (a, b) => (conflictCols || []).length > 0 && conflictCols.every((k) => a[k] === b[k]);
        if (action === 'insert' && given.some((row) => rows.some((old) => sameKey(spec, old, row)))) {
          return fail('23505', `duplicate key value violates unique constraint "${name}_pkey"`);
        }
        /* As PostgREST does it: a new row takes the column defaults; a row merged on conflict
           changes only the columns the caller sent. */
        const plan = given.map((row) => {
          const old = action === 'upsert' ? rows.find((r) => clash(r, row)) : null;
          return { old, row: old ? row : withDefaults(spec, row) };
        });
        for (const { old, row } of plan) {
          const gap = missing(spec, old ? { ...old, ...row } : row);
          if (gap) return fail('23502', `null value in column "${gap}" of relation "${name}" violates not-null constraint`);
        }
        const written = [];
        for (const { old, row } of plan) {
          if (old) {
            if (options.ignoreDuplicates) continue;
            Object.assign(old, row);
            written.push(copy(old));
          } else {
            rows.push(row);
            written.push(copy(row));
          }
        }
        if (written.length) writes.push({ table: name, action, rows: written });
        return { data: written.map(project), error: null };
      }
      if (action === 'update') {
        const hit = rows.filter(matches);
        for (const row of hit) Object.assign(row, copy(input));
        if (hit.length) writes.push({ table: name, action, rows: hit.map(copy) });
        return { data: hit.map(project), error: null };
      }
      if (action === 'delete') {
        const gone = rows.filter(matches);
        tables.set(name, rows.filter((r) => !matches(r)));
        if (gone.length) writes.push({ table: name, action, rows: gone.map(copy) });
        return { data: gone.map(project), error: null };
      }
      let found = rows.filter(matches);
      if (orderBy) {
        const { k, ascending } = orderBy;
        found = [...found].sort((a, b) => (a[k] === b[k] ? 0 : (a[k] > b[k] ? 1 : -1)) * (ascending ? 1 : -1));
      }
      if (limitN !== null) found = found.slice(0, limitN);
      const data = found.map(project);
      if (one === 'single' && data.length !== 1) return fail('PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return { data: one ? (data[0] ?? null) : data, error: null };
    }

    const query = {
      select(cols = '*') { columns = cols; return query; },
      insert(value) { action = 'insert'; input = value; return query; },
      upsert(value, opts = {}) { action = 'upsert'; input = value; options = opts; return query; },
      update(value) { action = 'update'; input = value; return query; },
      delete() { action = 'delete'; return query; },
      eq(k, v) { filters.push((r) => r[k] === v); return query; },
      neq(k, v) { filters.push((r) => r[k] !== v); return query; },
      lt(k, v) { filters.push((r) => r[k] < v); return query; },
      lte(k, v) { filters.push((r) => r[k] <= v); return query; },
      gt(k, v) { filters.push((r) => r[k] > v); return query; },
      gte(k, v) { filters.push((r) => r[k] >= v); return query; },
      in(k, values) { const set = new Set(values); filters.push((r) => set.has(r[k])); return query; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return query; },
      not(k, op, v) {
        if (op !== 'is' || v !== null) throw new Error(`memorySupabase: unsupported not(${k}, ${op})`);
        filters.push((r) => r[k] !== null && r[k] !== undefined);
        return query;
      },
      order(k, opts = {}) { orderBy = { k, ascending: opts.ascending !== false }; return query; },
      limit(n) { limitN = Math.max(0, Number(n) | 0); return query; },
      maybeSingle() { one = 'maybe'; return query; },
      single() { one = 'single'; return query; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return query;
  }

  return {
    from,
    /* No test here reads through an RPC; one that does must say so rather than get nothing. */
    rpc: async (fn) => ({ data: null, error: { code: 'TEST', message: `memorySupabase: rpc ${fn} is not modelled` } }),
    /** Put rows in a table as they already stand, without logging them as writes. */
    seed(name, rows) { rowsOf(name).push(...rows.map((r) => withDefaults(specOf(name), copy(r)))); },
    /** A table's rows as they stand now (copies). */
    rows(name) { return rowsOf(name).map(copy); },
    writes,
  };
}
