// Vercel serverless entry: wraps the Express API so it can be hosted alongside
// the static React build. All /api/* requests are rewritten here (vercel.json).
//
// The in-memory demo database is used (no PostgreSQL on Vercel). It is seeded
// deterministically, so every instance serves identical demo data; records
// created at runtime live only as long as the warm function instance.
process.env.NAWI_DB_MODE = 'memory';

module.exports = require('../server/src/index.js');
