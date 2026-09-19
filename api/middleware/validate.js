/**
 * validate({ body, params, query }): the request's shape, checked before the handler runs.
 *
 * Audit M1-2 (2026-09-19). A bad body used to reach the handler and come back as a 500
 * from wherever it first broke; now it is a 400 that names the field. Schemas are zod;
 * what parses is written back (req.body, req.params, req.query), so a handler reads the
 * checked value. Unknown keys pass through: a schema here says what a field must be
 * when present, and the handler decides what it needs.
 */
import { z } from 'zod';

const PARTS = ['params', 'query', 'body'];

/**
 * @param {{ body?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny }} schemas
 */
export function validate(schemas) {
  for (const part of Object.keys(schemas)) if (!PARTS.includes(part)) throw new Error(`validate: unknown part ${part}`);
  return (req, res, next) => {
    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const issue = result.error.issues[0];
        const field = issue?.path?.length ? issue.path.join('.') : part;
        return res.status(400).json({ success: false, error: 'Invalid request', field, message: issue?.message || 'Invalid value' });
      }
      if (part === 'query') Object.assign(req.query, result.data); // Express 5 exposes query as a getter
      else req[part] = result.data;
    }
    next();
  };
}

export { z };
