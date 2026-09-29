const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { verifyToken, requireRole } = require('../middleware/auth');

/**
 * GET /api/audit
 * List audit logs with pagination, filtering by action, userId, entityType, and date ranges
 */
router.get('/', verifyToken, requireRole('ADMIN', 'INSPECTOR', 'VIEWER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const action = req.query.action;
    const userId = req.query.userId;
    const entityType = req.query.entityType;
    const entityId = req.query.entityId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const where = {};
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [total, auditLogs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      data: auditLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
