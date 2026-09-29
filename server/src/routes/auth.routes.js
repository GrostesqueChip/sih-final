// Guarantees JWT_SECRET is populated even when these routes are mounted by a
// test harness that never loads src/index.js. Idempotent across modules.
require('../lib/bootstrapEnv').bootstrapEnv({ silent: true });

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  rateLimit = null;
}
const prisma = require('../lib/prisma');
const { verifyToken } = require('../middleware/auth');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');

const JWT_SECRET = process.env.JWT_SECRET;

// Rate Limiting for Login Route (prevent brute-force password attacks)
const authLimiter = rateLimit
  ? rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 10 : 500, // 500 in dev/demo, 10 in production
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
      },
      skip: (req) => process.env.NODE_ENV === 'test',
    })
  : (req, res, next) => next();

/**
 * POST /api/auth/login
 * Authenticate user, issue JWT, and create audit log
 */
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email, password } = req.body;
      const clientIp = getClientIp(req);

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (!user) {
        await createAuditLog({
          action: 'LOGIN_FAILED',
          details: `Failed login attempt for non-existent email: ${email}`,
          ipAddress: clientIp,
        });
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (!user.isActive) {
        await createAuditLog({
          userId: user.id,
          action: 'LOGIN_BLOCKED',
          details: `Deactivated user attempted login: ${email}`,
          ipAddress: clientIp,
        });
        return res.status(403).json({ success: false, message: 'Account is deactivated. Contact Administrator.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        await createAuditLog({
          userId: user.id,
          action: 'LOGIN_FAILED',
          details: `Invalid password attempt for email: ${email}`,
          ipAddress: clientIp,
        });
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => null);

      await createAuditLog({
        userId: user.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        details: `${user.name} signed in (${user.role})`,
        ipAddress: clientIp,
      });

      return res.json({
        success: true,
        message: 'Authentication successful',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          designation: user.designation || null,
          district: user.district || null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/logout
 * Log user out and write audit record
 */
router.post('/logout', verifyToken, async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: req.user.id,
      details: `User ${req.user.email} logged out`,
      ipAddress: clientIp,
    });

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Return profile of authenticated user
 */
router.get('/me', verifyToken, async (req, res) => {
  return res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      designation: req.user.designation || null,
      district: req.user.district || null,
      isActive: req.user.isActive,
    },
  });
});

module.exports = router;
