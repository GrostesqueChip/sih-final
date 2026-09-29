const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const prisma = require('../lib/prisma');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');
const { complianceFor } = require('../services/compliance');

/**
 * GET /api/instruments
 * List all instruments with pagination, search, and filters
 */
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search?.trim() || '';
    const type = req.query.type;
    const accuracyClass = req.query.accuracyClass;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;

    const where = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    if (type) {
      where.type = type;
    }
    if (accuracyClass) {
      where.accuracyClass = accuracyClass;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { district: { contains: search, mode: 'insensitive' } },
        { ownerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, instruments] = await Promise.all([
      prisma.instrument.count({ where }),
      prisma.instrument.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { testSessions: true },
          },
          testSessions: {
            select: { id: true, certificateNo: true, status: true, overallResult: true, completedAt: true, sealedAt: true, verificationType: true },
          },
        },
      }),
    ]);

    const withCompliance = instruments.map(({ testSessions = [], ...inst }) => ({
      ...inst,
      compliance: complianceFor(testSessions),
    }));

    return res.json({
      success: true,
      data: withCompliance,
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
 * GET /api/instruments/:id
 * Get single instrument details with test history
 */
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const instrument = await prisma.instrument.findUnique({
      where: { id },
      include: {
        testSessions: {
          orderBy: { startedAt: 'desc' },
          include: {
            conductedBy: {
              select: { id: true, name: true, email: true },
            },
            _count: {
              select: { testResults: true },
            },
          },
        },
      },
    });

    if (!instrument) {
      return res.status(404).json({ success: false, message: 'Instrument not found' });
    }

    return res.json({ success: true, data: { ...instrument, compliance: complianceFor(instrument.testSessions || []) } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/instruments
 * Create a new instrument (ADMIN or INSPECTOR)
 */
router.post(
  '/',
  verifyToken,
  requireRole('ADMIN', 'INSPECTOR'),
  [
    body('name').trim().notEmpty().withMessage('Instrument name is required'),
    body('type').isIn(['ELECTRONIC_SCALE', 'PLATFORM_SCALE', 'WEIGHBRIDGE', 'LABORATORY_BALANCE']).withMessage('Valid instrument type is required'),
    body('manufacturer').trim().notEmpty().withMessage('Manufacturer is required'),
    body('model').trim().notEmpty().withMessage('Model is required'),
    body('serialNumber').trim().notEmpty().withMessage('Unique serial number is required'),
    body('accuracyClass').isIn(['CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IIII']).withMessage('Valid accuracy class is required'),
    body('maxCapacity').isFloat({ gt: 0 }).withMessage('Maximum capacity must be a positive number'),
    body('minCapacity').isFloat({ min: 0 }).withMessage('Minimum capacity must be >= 0'),
    body('verificationInterval').isFloat({ gt: 0 }).withMessage('Verification interval (e) must be positive'),
    body('actualInterval').isFloat({ gt: 0 }).withMessage('Actual interval (d) must be positive'),
    body('unit').optional().isString().trim(),
    body('location').trim().notEmpty().withMessage('Location is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        name,
        type,
        manufacturer,
        model,
        serialNumber,
        accuracyClass,
        maxCapacity,
        minCapacity,
        verificationInterval,
        actualInterval,
        unit = 'kg',
        location,
      } = req.body;

      // Check serial uniqueness
      const existing = await prisma.instrument.findUnique({
        where: { serialNumber },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Instrument with serial number '${serialNumber}' already exists.`,
        });
      }

      const instrument = await prisma.instrument.create({
        data: {
          name,
          type,
          manufacturer,
          model,
          serialNumber,
          accuracyClass,
          maxCapacity: parseFloat(maxCapacity),
          minCapacity: parseFloat(minCapacity),
          verificationInterval: parseFloat(verificationInterval),
          actualInterval: parseFloat(actualInterval),
          unit: unit || 'kg',
          location,
          district: req.body.district?.trim() || null,
          ownerName: req.body.ownerName?.trim() || null,
          isActive: true,
        },
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'CREATE_INSTRUMENT',
        entityType: 'Instrument',
        entityId: instrument.id,
        details: `Created instrument: ${instrument.name} (${instrument.serialNumber})`,
        newValues: instrument,
        ipAddress: clientIp,
      });

      return res.status(201).json({
        success: true,
        message: 'Instrument created successfully',
        data: instrument,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/instruments/:id
 * Update instrument specifications (ADMIN, INSPECTOR)
 */
router.put(
  '/:id',
  verifyToken,
  requireRole('ADMIN', 'INSPECTOR'),
  [
    body('name').optional().trim().notEmpty(),
    body('type').optional().isIn(['ELECTRONIC_SCALE', 'PLATFORM_SCALE', 'WEIGHBRIDGE', 'LABORATORY_BALANCE']),
    body('accuracyClass').optional().isIn(['CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IIII']),
    body('maxCapacity').optional().isFloat({ gt: 0 }),
    body('minCapacity').optional().isFloat({ min: 0 }),
    body('verificationInterval').optional().isFloat({ gt: 0 }),
    body('actualInterval').optional().isFloat({ gt: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const oldInstrument = await prisma.instrument.findUnique({ where: { id } });

      if (!oldInstrument) {
        return res.status(404).json({ success: false, message: 'Instrument not found' });
      }

      // Whitelist editable columns so stray form fields never reach the database.
      const EDITABLE = ['name', 'type', 'manufacturer', 'model', 'serialNumber', 'accuracyClass', 'maxCapacity', 'minCapacity',
        'verificationInterval', 'actualInterval', 'unit', 'location', 'district', 'ownerName', 'isActive', 'ranges'];
      const updateData = Object.fromEntries(Object.entries(req.body).filter(([k]) => EDITABLE.includes(k)));

      // Metrological particulars are sealed into every issued certificate/report.
      // Once the instrument has a sealed session they are locked: a changed
      // class, serial, capacity or interval means a different instrument, which
      // must be registered afresh. (Owner, location and name stay editable.)
      const SEALED_PARTICULARS = ['manufacturer', 'model', 'serialNumber', 'accuracyClass', 'maxCapacity', 'minCapacity',
        'verificationInterval', 'actualInterval', 'unit', 'ranges'];
      const changedSealed = SEALED_PARTICULARS.filter(
        (k) => updateData[k] !== undefined && JSON.stringify(updateData[k]) !== JSON.stringify(oldInstrument[k]) &&
          !(typeof oldInstrument[k] === 'number' && Number(updateData[k]) === oldInstrument[k])
      );
      if (changedSealed.length) {
        const sealedCount = await prisma.testSession
          .count({ where: { instrumentId: id, status: { in: ['COMPLETED', 'FAILED'] } } })
          .catch(() => 0);
        if (sealedCount > 0) {
          return res.status(409).json({
            success: false,
            message: `Cannot change ${changedSealed.join(', ')}: these particulars are sealed into ${sealedCount} issued certificate(s)/report(s). Register the instrument afresh instead.`,
            lockedFields: changedSealed,
          });
        }
      }
      if (updateData.maxCapacity !== undefined) updateData.maxCapacity = parseFloat(updateData.maxCapacity);
      if (updateData.minCapacity !== undefined) updateData.minCapacity = parseFloat(updateData.minCapacity);
      if (updateData.verificationInterval !== undefined) updateData.verificationInterval = parseFloat(updateData.verificationInterval);
      if (updateData.actualInterval !== undefined) updateData.actualInterval = parseFloat(updateData.actualInterval);

      const updatedInstrument = await prisma.instrument.update({
        where: { id },
        data: updateData,
      });

      const clientIp = getClientIp(req);
      await createAuditLog({
        userId: req.user.id,
        action: 'UPDATE_INSTRUMENT',
        entityType: 'Instrument',
        entityId: id,
        details: `Updated instrument specifications for ${updatedInstrument.serialNumber}`,
        oldValues: oldInstrument,
        newValues: updatedInstrument,
        ipAddress: clientIp,
      });

      return res.json({
        success: true,
        message: 'Instrument updated successfully',
        data: updatedInstrument,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/instruments/:id
 * Soft delete instrument (ADMIN only)
 */
router.delete('/:id', verifyToken, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const instrument = await prisma.instrument.findUnique({ where: { id } });

    if (!instrument) {
      return res.status(404).json({ success: false, message: 'Instrument not found' });
    }

    const deactivated = await prisma.instrument.update({
      where: { id },
      data: { isActive: false },
    });

    const clientIp = getClientIp(req);
    await createAuditLog({
      userId: req.user.id,
      action: 'DEACTIVATE_INSTRUMENT',
      entityType: 'Instrument',
      entityId: id,
      details: `Soft deleted / deactivated instrument: ${instrument.serialNumber}`,
      oldValues: instrument,
      newValues: deactivated,
      ipAddress: clientIp,
    });

    return res.json({
      success: true,
      message: 'Instrument deactivated successfully',
      data: deactivated,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
