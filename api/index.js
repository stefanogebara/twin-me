/**
 * The one serverless function.
 * ============================
 * Vercel compiles every file under api/ as its own function, each with its own copy of
 * node_modules: 674 of them here, 2.5 GB and 19 minutes a build, $132 in September 2026
 * (D26). Everything the server is lives under api/_app/, which the underscore keeps out of
 * that compilation; this file is the only entry, and vercel.json rewrites /api/* to it.
 * Never add a second .js file directly under api/.
 */
import app from './_app/server.js';

export default app;
