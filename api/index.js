// Vercel serverless entry point: every /api/* request is rewritten here (see
// vercel.json) and handled by the same Express app that `npm run dev` serves.
module.exports = require('../server/src/index.js');
