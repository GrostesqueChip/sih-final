/**
 * Photographs and supporting documents attached to a test session.
 *
 *   GET    /api/tests/:sessionId/attachments          list (metadata only)
 *   POST   /api/tests/:sessionId/attachments          upload one file (multipart field "file", optional "caption")
 *   GET    /api/tests/:sessionId/attachments/:id      download
 *   DELETE /api/tests/:sessionId/attachments/:id      remove
 *
 * Files are accepted only while the session is open: once it is sealed the
 * attachment list is part of the record and can no longer change. The type is
 * decided from the file's leading bytes, never from the name or the browser's
 * claim, and each file's SHA-256 is stored and printed in the report annex.
 */
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createAuditLog, getClientIp } = require('../middleware/auditLog');

const router = express.Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_SESSION = 10;
const MAX_CAPTION = 200;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } }).single('file');

/** Identify an allowed file type from its first bytes. Returns null for anything else. */
function sniffType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

/** Keep a readable base name, drop any path and anything that is not a plain file-name character. */
function safeName(original, ext) {
  const base = String(original || 'file')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9 _.-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 80);
  return `${base || 'file'}.${ext}`;
}

const isSealed = (s) => s.status === 'COMPLETED' || s.status === 'FAILED' || Boolean(s.verificationSeal);
const publicView = (a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, sha256: a.sha256, caption: a.caption || null, uploadedById: a.uploadedById, createdAt: a.createdAt });

async function loadSession(req, res) {
  const session = await prisma.testSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session) {
    res.status(404).json({ success: false, message: 'Test session not found' });
    return null;
  }
  return session;
}

/** Same rule as recording readings: the officer who opened the session, or the Controller. */
function mayChange(req, res, session) {
  if (req.user.role !== 'ADMIN' && session.conductedById && session.conductedById !== req.user.id) {
    res.status(403).json({ success: false, message: 'Access denied: only the officer who opened this session (or the Controller) can change its attachments.' });
    return false;
  }
  if (isSealed(session)) {
    res.status(409).json({ success: false, message: 'This session is sealed: its attachments can no longer be changed.' });
    return false;
  }
  return true;
}

router.get('/:sessionId/attachments', verifyToken, async (req, res, next) => {
  try {
    const session = await loadSession(req, res);
    if (!session) return undefined;
    const list = await prisma.sessionAttachment.findMany({ where: { testSessionId: session.id }, orderBy: { createdAt: 'asc' } });
    return res.json({ success: true, data: list.map(publicView), limits: { maxFileBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES_PER_SESSION, types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] } });
  } catch (error) {
    return next(error);
  }
});

router.post('/:sessionId/attachments', verifyToken, requireRole('ADMIN', 'INSPECTOR'), (req, res, next) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({ success: false, message: tooBig ? `File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.` : `Upload rejected: ${err.message}` });
      }
      const session = await loadSession(req, res);
      if (!session) return undefined;
      if (!mayChange(req, res, session)) return undefined;
      if (!req.file || !req.file.buffer?.length) {
        return res.status(400).json({ success: false, message: 'No file received. Send one file in the "file" field.' });
      }
      const type = sniffType(req.file.buffer);
      if (!type) {
        return res.status(400).json({ success: false, message: 'Only JPEG, PNG or WebP photographs and PDF documents can be attached.' });
      }
      const existing = await prisma.sessionAttachment.count({ where: { testSessionId: session.id } });
      if (existing >= MAX_FILES_PER_SESSION) {
        return res.status(409).json({ success: false, message: `A session can hold at most ${MAX_FILES_PER_SESSION} attachments.` });
      }
      const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, MAX_CAPTION) : '';
      const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

      const created = await prisma.sessionAttachment.create({
        data: {
          testSessionId: session.id,
          fileName: safeName(req.file.originalname, type.ext),
          mimeType: type.mime,
          size: req.file.buffer.length,
          sha256,
          caption: caption || null,
          data: req.file.buffer,
          uploadedById: req.user.id,
        },
      });

      await createAuditLog({
        userId: req.user.id,
        action: 'ADD_ATTACHMENT',
        entityType: 'TestSession',
        entityId: session.id,
        details: `Attached ${created.fileName} (${created.mimeType}, ${created.size} bytes, sha256 ${sha256.slice(0, 12)}…) to ${session.certificateNo}`,
        ipAddress: getClientIp(req),
      });

      return res.status(201).json({ success: true, message: 'Attachment saved', data: publicView(created) });
    } catch (error) {
      return next(error);
    }
  });
});

router.get('/:sessionId/attachments/:attachmentId', verifyToken, async (req, res, next) => {
  try {
    const session = await loadSession(req, res);
    if (!session) return undefined;
    const att = await prisma.sessionAttachment.findFirst({ where: { id: req.params.attachmentId, testSessionId: session.id } });
    if (!att) return res.status(404).json({ success: false, message: 'Attachment not found' });
    const body = Buffer.isBuffer(att.data) ? att.data : Buffer.from(att.data);
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${att.fileName}"`);
    res.setHeader('Content-Length', body.length);
    return res.send(body);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:sessionId/attachments/:attachmentId', verifyToken, requireRole('ADMIN', 'INSPECTOR'), async (req, res, next) => {
  try {
    const session = await loadSession(req, res);
    if (!session) return undefined;
    if (!mayChange(req, res, session)) return undefined;
    const att = await prisma.sessionAttachment.findFirst({ where: { id: req.params.attachmentId, testSessionId: session.id } });
    if (!att) return res.status(404).json({ success: false, message: 'Attachment not found' });
    await prisma.sessionAttachment.delete({ where: { id: att.id } });
    await createAuditLog({
      userId: req.user.id,
      action: 'REMOVE_ATTACHMENT',
      entityType: 'TestSession',
      entityId: session.id,
      details: `Removed attachment ${att.fileName} from ${session.certificateNo}`,
      ipAddress: getClientIp(req),
    });
    return res.json({ success: true, message: 'Attachment removed' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
module.exports.sniffType = sniffType;
module.exports.safeName = safeName;
module.exports.LIMITS = { MAX_FILE_BYTES, MAX_FILES_PER_SESSION };
