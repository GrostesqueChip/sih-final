/**
 * PostgreSQL seed for NAWI-ReportPro.
 *
 * Loads exactly the same demonstration dataset as the in-memory demo mode
 * (server/src/lib/demoSeed.js), so both deployment paths show identical
 * instruments, sessions, certificates and audit trail.
 *
 *   npx prisma migrate dev --name init && npx prisma db seed
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
    await prisma.testSession.create({
      data: {
        ...s,
        verificationSeal: sealed ? generateVerificationSeal(buildSealInput({ ...s, instrument: inst })) : null,
      },
    });
  }
  await prisma.testResult.createMany({ data: testResults });
  await prisma.auditLog.createMany({ data: auditLogs.map(({ oldValues, newValues, ...a }) => a) });

  console.log(`Seeded ${users.length} officers, ${instruments.length} instruments, ${testSessions.length} sessions, ${testResults.length} test results, ${auditLogs.length} audit entries.`);
  console.log('Demo logins: admin@nawi.gov.in / Admin@123 · inspector@nawi.gov.in / Inspector@123 · viewer@nawi.gov.in / Viewer@123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
