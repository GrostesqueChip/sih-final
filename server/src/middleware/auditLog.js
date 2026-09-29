const prisma = require('../lib/prisma');

/**
 * Creates an immutable audit log record in the database.
 * 
 * @param {Object} params
 * @param {string|null} params.userId - User ID who triggered the action
 * @param {string} params.action - Action identifier (e.g. LOGIN, CREATE_INSTRUMENT, ENTER_TEST_DATA)
 * @param {string|null} [params.entityType] - Entity class name (e.g. Instrument, TestSession, TestResult, User)
 * @param {string|null} [params.entityId] - Primary key of affected entity
 * @param {string|null} [params.details] - Human-readable description
 * @param {Object|null} [params.oldValues] - Previous snapshot state (for updates/deletes)
 * @param {Object|null} [params.newValues] - New snapshot state
 * @param {string|null} [params.ipAddress] - Client IP address
 * @returns {Promise<Object>} Created AuditLog record
 */
const createAuditLog = async ({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  details = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
}) => {
  try {
    const log = await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        details,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : undefined,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
        ipAddress,
      },
    });
    return log;
  } catch (error) {
    console.error('Failed to create audit log entry:', error);
    // Non-blocking in production so business transactions can continue, but log error
    return null;
  }
};

/**
 * Helper middleware to automatically extract client IP address
 */
const getClientIp = (req) => {
  if (!req) return '127.0.0.1';
  const raw =
    req.headers?.['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    '127.0.0.1';
  // Present IPv6 loopback / IPv4-mapped addresses in familiar dotted form.
  if (raw === '::1') return '127.0.0.1';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

module.exports = {
  createAuditLog,
  getClientIp,
};
