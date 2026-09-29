const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');

/**
 * GET /api/users
 * List all users (ADMIN only)
 */
router.get('/', verifyToken, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const role = req.query.role;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          designation: true,
          district: true,
          phone: true,
          lastLoginAt: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { testSessions: true },
          },
        },
      }),
    ]);

    return res.json({
      success: true,
      data: users,
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

/**
 * POST /api/users
 * Create a new user (ADMIN only)
 */
router.post(
  '/',
  verifyToken,
  requireRole('ADMIN'),
  [
    body('name').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email address is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('role').isIn(['ADMIN', 'INSPECTOR', 'VIEWER']).withMessage('Role must be ADMIN, INSPECTOR, or VIEWER'),
    body('designation').optional().isString(),
    body('district').optional().isString(),
    body('phone').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { name, email, password, role } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: `User with email '${normalizedEmail}' already exists.`,
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = await prisma.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          role,
          designation: req.body.designation?.trim() || null,
          district: req.body.district?.trim() || null,
          phone: req.body.phone?.trim() || null,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          designation: true,
          district: true,
          phone: true,
          lastLoginAt: true,
          isActive: true,
          createdAt: true,
        },
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: newUser.id,
        details: `Created new user ${newUser.email} with role ${newUser.role}`,
        newValues: newUser,
        ipAddress: clientIp,
      });

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: newUser,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/users/:id
 * Update user profile or role (ADMIN only)
 */
router.put(
  '/:id',
  verifyToken,
  requireRole('ADMIN'),
  [
    body('name').optional().trim().notEmpty(),
    body('email').optional().isEmail(),
    body('password').optional().isLength({ min: 6 }),
    body('role').optional().isIn(['ADMIN', 'INSPECTOR', 'VIEWER']),
    body('isActive').optional().isBoolean(),
    body('designation').optional().isString(),
    body('district').optional().isString(),
    body('phone').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const oldUser = await prisma.user.findUnique({ where: { id } });

      if (!oldUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const updateData = {};
      if (req.body.name) updateData.name = req.body.name.trim();
      if (req.body.role) updateData.role = req.body.role;
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;
      for (const f of ['designation', 'district', 'phone']) {
        if (typeof req.body[f] === 'string') updateData[f] = req.body[f].trim() || null;
      }

      if (req.body.email) {
        const normalizedEmail = req.body.email.toLowerCase().trim();
        if (normalizedEmail !== oldUser.email) {
          const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
          if (exists) {
            return res.status(400).json({ success: false, message: 'Email is already in use by another user.' });
          }
          updateData.email = normalizedEmail;
        }
      }

      if (req.body.password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(req.body.password, salt);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          designation: true,
          district: true,
          phone: true,
          lastLoginAt: true,
          isActive: true,
          updatedAt: true,
        },
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: id,
        details: `Updated user profile/role for ${updatedUser.email}`,
        oldValues: { id: oldUser.id, email: oldUser.email, role: oldUser.role, isActive: oldUser.isActive },
        newValues: updatedUser,
        ipAddress: clientIp,
      });

      return res.json({
        success: true,
        message: 'User updated successfully',
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/users/:id
 * Deactivate user account (ADMIN only)
 */
router.delete('/:id', verifyToken, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own administrative account.',
      });
    }

    const oldUser = await prisma.user.findUnique({ where: { id } });
    if (!oldUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const deactivatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    const clientIp = getClientIp(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'DEACTIVATE_USER',
      entityType: 'User',
      entityId: id,
      details: `Deactivated user account: ${oldUser.email}`,
      oldValues: { isActive: true },
      newValues: { isActive: false },
      ipAddress: clientIp,
    });

    return res.json({
      success: true,
      message: 'User deactivated successfully',
      data: deactivatedUser,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
