/**
 * In-memory database with a Prisma-compatible surface.
 *
 * Used automatically when PostgreSQL is not configured (the state of an
 * evaluator's laptop) and forced by `npm run demo`. The dataset comes from
 * `demoSeed.js`; every sealed session is sealed with the same canonical HMAC
 * helper used by the live finalize endpoint, so the public verification portal
 * reports the seeded certificates as authentic.
 */

// Ensure HMAC_SECRET is populated before we compute demo seals, even if this
// module is imported ahead of the server bootstrap.
require('./bootstrapEnv').bootstrapEnv({ silent: true });
const { generateVerificationSeal, buildSealInput } = require('../services/cryptoSeal');
const { buildDemoData } = require('./demoSeed');

const users = [];
const instruments = [];
const testSessions = [];
const testResults = [];
const auditLogs = [];

/** (Re)load the demonstration dataset in place, keeping array identities. */
function loadDemoData() {
  const fresh = buildDemoData();
  [
    [users, fresh.users],
    [instruments, fresh.instruments],
    [testSessions, fresh.testSessions],
    [testResults, fresh.testResults],
    [auditLogs, fresh.auditLogs],
  ].forEach(([target, source]) => {
    target.splice(0, target.length, ...source);
  });
  for (const session of testSessions) {
    if (session.status !== 'COMPLETED' && session.status !== 'FAILED') continue;
    const inst = instruments.find((i) => i.id === session.instrumentId);
    const results = testResults.filter((r) => r.testSessionId === session.id);
    session.verificationSeal = generateVerificationSeal(
      buildSealInput({ ...session, instrument: inst, testResults: results })
    );
  }
}
loadDemoData();

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------
function cmp(a, b) {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function matchesFilter(item, where = {}) {
  if (!where || Object.keys(where).length === 0) return true;
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;

    if (k === 'OR' && Array.isArray(v)) {
      if (!v.some((cond) => matchesFilter(item, cond))) return false;
      continue;
    }
    if (k === 'AND' && Array.isArray(v)) {
      if (!v.every((cond) => matchesFilter(item, cond))) return false;
      continue;
    }
    if (k === 'NOT') {
      if (matchesFilter(item, v)) return false;
      continue;
    }
    if (k === 'email' && typeof v === 'string') {
      if (item.email?.toLowerCase() !== v.toLowerCase()) return false;
      continue;
    }

    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      const ops = ['contains', 'startsWith', 'endsWith', 'in', 'notIn', 'not', 'equals', 'gte', 'lte', 'gt', 'lt'];
      if (!Object.keys(v).some((op) => ops.includes(op))) {
        // Compound unique key (e.g. testSessionId_testType) or nested filter.
        if (!matchesFilter(item, v)) return false;
        continue;
      }
      const val = item[k];
      const insensitive = v.mode === 'insensitive';
      const norm = (x) => (insensitive ? String(x ?? '').toLowerCase() : String(x ?? ''));
      if ('contains' in v && !norm(val).includes(norm(v.contains))) return false;
      if ('startsWith' in v && !norm(val).startsWith(norm(v.startsWith))) return false;
      if ('endsWith' in v && !norm(val).endsWith(norm(v.endsWith))) return false;
      if ('in' in v && !v.in.includes(val)) return false;
      if ('notIn' in v && v.notIn.includes(val)) return false;
      if ('not' in v && val === v.not) return false;
      if ('equals' in v && val !== v.equals) return false;
      if ('gte' in v && cmp(val, v.gte) < 0) return false;
      if ('lte' in v && cmp(val, v.lte) > 0) return false;
      if ('gt' in v && cmp(val, v.gt) <= 0) return false;
      if ('lt' in v && cmp(val, v.lt) >= 0) return false;
      continue;
    }

    if (item[k] !== v) return false;
  }
  return true;
}

function sortList(list, orderBy) {
  if (!orderBy) return list;
  const clauses = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...list].sort((a, b) => {
    for (const [field, dir] of clauses) {
      const c = cmp(a[field], b[field]);
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

function applySelect(obj, select) {
  if (!select || !obj) return obj;
  const out = {};
  for (const [k, v] of Object.entries(select)) {
    if (v && k in obj) out[k] = obj[k];
  }
  return out;
}

const publicUser = (u) =>
  u ? { id: u.id, name: u.name, email: u.email, role: u.role, designation: u.designation, district: u.district } : null;

// ---------------------------------------------------------------------------
// Relation hydrators (always attach relations; routes pick what they need)
// ---------------------------------------------------------------------------
function hydrateSession(s) {
  return {
    ...s,
    instrument: instruments.find((i) => i.id === s.instrumentId) || null,
    conductedBy: publicUser(users.find((u) => u.id === s.conductedById)),
    testResults: sortList(testResults.filter((r) => r.testSessionId === s.id), { createdAt: 'asc' }),
    _count: { testResults: testResults.filter((r) => r.testSessionId === s.id).length },
  };
}

function hydrateInstrument(inst) {
  const sessions = testSessions.filter((s) => s.instrumentId === inst.id);
  return {
    ...inst,
    testSessions: sortList(sessions, { startedAt: 'desc' }).map((s) => ({
      ...s,
      conductedBy: publicUser(users.find((u) => u.id === s.conductedById)),
      _count: { testResults: testResults.filter((r) => r.testSessionId === s.id).length },
    })),
    _count: { testSessions: sessions.length },
  };
}

function hydrateResult(r) {
  const session = testSessions.find((s) => s.id === r.testSessionId);
  return { ...r, testSession: session ? hydrateSession(session) : null };
}

function hydrateUser(u) {
  return { ...u, _count: { testSessions: testSessions.filter((s) => s.conductedById === u.id).length } };
}

function hydrateAudit(a) {
  return { ...a, user: publicUser(users.find((u) => u.id === a.userId)) };
}

let idCounter = 0;
function newId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function createModelHandler(collection, hydrator, prefix) {
  const out = (item, args = {}) => {
    const full = hydrator ? hydrator(item) : { ...item };
    return args.select ? applySelect(full, args.select) : full;
  };
  return {
    async findUnique(args = {}) {
      const item = collection.find((x) => matchesFilter(x, args.where));
      return item ? out(item, args) : null;
    },
    async findFirst(args = {}) {
      const list = sortList(collection.filter((x) => matchesFilter(x, args.where)), args.orderBy);
      return list[0] ? out(list[0], args) : null;
    },
    async findMany(args = {}) {
      const { where = {}, take, skip = 0, orderBy } = args;
      let list = sortList(collection.filter((x) => matchesFilter(x, where)), orderBy);
      if (skip > 0) list = list.slice(skip);
      if (typeof take === 'number' && take > 0) list = list.slice(0, take);
      return list.map((x) => out(x, args));
    },
    async count(args = {}) {
      return collection.filter((x) => matchesFilter(x, args.where)).length;
    },
    async create(args = {}) {
      const { data = {} } = args;
      const now = new Date();
      const { testResults: nested, ...rest } = data;
      const item = { id: data.id || newId(prefix), createdAt: now, updatedAt: now, ...rest };
      if (collection === testSessions && Array.isArray(nested?.create)) {
        for (const tr of nested.create) {
          testResults.push({ id: newId('res'), testSessionId: item.id, createdAt: now, updatedAt: now, ...tr });
        }
      }
      collection.push(item);
      return out(item, args);
    },
    async update(args = {}) {
      const idx = collection.findIndex((x) => matchesFilter(x, args.where));
      if (idx === -1) throw new Error('Record to update not found');
      collection[idx] = { ...collection[idx], ...args.data, updatedAt: new Date() };
      return out(collection[idx], args);
    },
    async updateMany(args = {}) {
      let count = 0;
      collection.forEach((x, i) => {
        if (matchesFilter(x, args.where)) {
          collection[i] = { ...x, ...args.data, updatedAt: new Date() };
          count += 1;
        }
      });
      return { count };
    },
    async upsert(args = {}) {
      const idx = collection.findIndex((x) => matchesFilter(x, args.where));
      if (idx !== -1) {
        collection[idx] = { ...collection[idx], ...args.update, updatedAt: new Date() };
        return out(collection[idx], args);
      }
      return this.create({ data: args.create, select: args.select });
    },
    async delete(args = {}) {
      const idx = collection.findIndex((x) => matchesFilter(x, args.where));
      if (idx === -1) throw new Error('Record to delete not found');
      const [removed] = collection.splice(idx, 1);
      return out(removed, args);
    },
    async deleteMany(args = {}) {
      let count = 0;
      for (let i = collection.length - 1; i >= 0; i -= 1) {
        if (matchesFilter(collection[i], args.where)) {
          collection.splice(i, 1);
          count += 1;
        }
      }
      return { count };
    },
    async groupBy(args = {}) {
      const { by = [], where } = args;
      const map = new Map();
      collection.filter((x) => matchesFilter(x, where)).forEach((item) => {
        const key = by.map((f) => item[f]).join('__');
        if (!map.has(key)) map.set(key, { count: 0, sample: item });
        map.get(key).count += 1;
      });
      return [...map.values()].map(({ count, sample }) => {
        const res = { _count: { _all: count } };
        by.forEach((f) => {
          res[f] = sample[f];
        });
        return res;
      });
    },
  };
}

const mockDb = {
  user: createModelHandler(users, hydrateUser, 'usr'),
  instrument: createModelHandler(instruments, hydrateInstrument, 'inst'),
  testSession: createModelHandler(testSessions, hydrateSession, 'sess'),
  testResult: createModelHandler(testResults, hydrateResult, 'res'),
  auditLog: createModelHandler(auditLogs, hydrateAudit, 'aud'),
  async $transaction(fnOrArray) {
    if (Array.isArray(fnOrArray)) return Promise.all(fnOrArray);
    if (typeof fnOrArray === 'function') return fnOrArray(mockDb);
    return fnOrArray;
  },
  resetDemoData: loadDemoData,
  async $connect() {},
  async $disconnect() {},
};

module.exports = mockDb;
