// Recording harness (not part of the app): boots the unchanged demo server with the
// production verify URL, and adds a side port that simulates someone editing one
// sealed reading directly in the database, for the "tampered certificate" shot.
const http = require('http');
const path = require('path');
// run against a checkout of main (PR #2 or later): REPO=/path/to/sih-final
const SERVER = path.join(process.env.REPO || path.resolve(__dirname, '../../..'), 'server');
process.env.PUBLIC_VERIFY_URL = 'https://nawi-reportpro.vercel.app';
require(path.join(SERVER, 'demo.js'));
const mockDb = require(path.join(SERVER, 'src/lib/mockDb'));

function bumpFirstReading(obj, trail = []) {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) { const r = bumpFirstReading(obj[i], trail.concat(i)); if (r) return r; }
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'number' && /indic|reading|value|observed/i.test(k)) {
        const before = obj[k]; obj[k] = +(before + 0.5).toFixed(4); return { path: trail.concat(k).join('.'), before, after: obj[k] };
      }
      const r = bumpFirstReading(obj[k], trail.concat(k)); if (r) return r;
    }
  }
  return null;
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/tamper') {
      const sid = u.searchParams.get('session') || 'sess-034';
      const results = await mockDb.testResult.findMany({ where: { testSessionId: sid } });
      for (const r of results) {
        const data = JSON.parse(JSON.stringify(r.data ?? null));
        const hit = bumpFirstReading(data);
        if (hit) {
          await mockDb.testResult.update({ where: { id: r.id }, data: { data } });
          res.end(JSON.stringify({ ok: true, result: r.id, testType: r.testType, ...hit }));
          return;
        }
      }
      res.end(JSON.stringify({ ok: false, count: results.length }));
    } else if (u.pathname === '/peek') {
      const results = await mockDb.testResult.findMany({ where: { testSessionId: u.searchParams.get('session') || 'sess-034' } });
      res.end(JSON.stringify(results.map((r) => ({ id: r.id, testType: r.testType, data: r.data })), null, 1).slice(0, 4000));
    } else { res.statusCode = 404; res.end(); }
  } catch (e) { res.statusCode = 500; res.end(String(e.stack || e)); }
}).listen(5055, () => console.log('harness side port 5055'));
