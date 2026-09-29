/**
 * PostgreSQL seed for NAWI-ReportPro.
 *
 * Loads exactly the same demonstration dataset as the in-memory demo mode
 * (server/src/lib/demoSeed.js), so both deployment paths show identical
 * instruments, sessions, certificates and audit trail.
 *
 *   npx prisma migrate deploy && npx prisma db seed
 *
 * `node prisma/seed.js --if-empty` seeds only an empty database; the Vercel
 * build uses it so redeploying never wipes certificates issued since.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { PrismaClient } = require('@prisma/client');
const { buildDemoData } = require('../src/lib/demoSeed');
const { generateVerificationSeal, buildSealInput } = require('../src/services/cryptoSeal');

const prisma = new PrismaClient();

async function main() {
  const { users, instruments, testSessions, testResults, auditLogs } = buildDemoData();

  console.log('Clearing existing data…');
  await prisma.auditLog.deleteMany();
  await prisma.testResult.deleteMany();
  await prisma.testSession.deleteMany();
  await prisma.instrument.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({ data: users });
  await prisma.instrument.createMany({ data: instruments.map(({ ranges, ...i }) => i) });

  for (const s of testSessions) {
    const inst = instruments.find((i) => i.id === s.instrumentId);
    const sealed = s.status === 'COMPLETED';
    const results = testResults.filter((r) => r.testSessionId === s.id);
    await prisma.testSession.create({
      data: {
        ...s,
        verificationSeal: sealed
          ? generateVerificationSeal(buildSealInput({ ...s, instrument: inst, testResults: results }))
          : null,
      },
    });
  }
  await prisma.testResult.createMany({ data: testResults });
  await prisma.auditLog.createMany({ data: auditLogs.map(({ oldValues, newValues, ...a }) => a) });

  console.log(`Seeded ${users.length} officers, ${instruments.length} instruments, ${testSessions.length} sessions, ${testResults.length} test results, ${auditLogs.length} audit entries.`);
  console.log('Demo logins: admin@nawi.gov.in / Admin@123 · inspector@nawi.gov.in / Inspector@123 · viewer@nawi.gov.in / Viewer@123');
}

/** Seed only when the database has no officers yet (safe to run on every deploy). */
async function seedIfEmpty() {
  const officers = await prisma.user.count();
  if (officers > 0) {
    console.log(`Database already holds ${officers} officers — demo seed skipped.`);
    return;
  }
  await main();
}

if (require.main === module) {
  const run = process.argv.includes('--if-empty') ? seedIfEmpty : main;
  run()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
