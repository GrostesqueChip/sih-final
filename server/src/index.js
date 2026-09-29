// Monorepo-aware environment bootstrap (SEC-CRIT-03).
// Loads server/.env then the repository-root .env. Missing cryptographic secrets
// are FATAL in production, and synthesised as random ephemeral values in
// development so that a freshly cloned repository boots without manual setup.
const { bootstrapEnv } = require('./lib/bootstrapEnv');

try {
  bootstrapEnv();
} catch (err) {
  if (require.main === module) {
    process.exit(1);
  }
  throw err;
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import Route Modules
const authRoutes = require('./routes/auth.routes');
const instrumentsRoutes = require('./routes/instruments.routes');
const testsRoutes = require('./routes/tests.routes');
const reportsRoutes = require('./routes/reports.routes');
const usersRoutes = require('./routes/users.routes');
const auditRoutes = require('./routes/audit.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const telemetryRoutes = require('./routes/telemetry.routes');
const batchRoutes = require('./routes/batch.routes');
const syncRoutes = require('./routes/sync.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Utility Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'NAWI-ReportPro API Server',
    version: '1.0.0',
    standards: 'OIML R-76-1:2006 / R-76-2:2007',
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/instruments', instrumentsRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/sync', syncRoutes);

// 404 Route Not Found Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found.`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);

  const statusCode = err.statusCode || err.status || 500;
  const response = {
    success: false,
    message: err.message || 'Internal Server Error',
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
});

/**
 * Boot the HTTP listener. Exported so alternate entry points (server/demo.js)
 * can start the identical server without duplicating bootstrap logic.
 * @returns {Promise<import('http').Server>}
 */
function startServer() {
  const prisma = require('./lib/prisma');

  const boot = () =>
    app.listen(PORT, () => {
      const mode =
        String(process.env.NAWI_DB_MODE || '').toLowerCase() === 'memory'
          ? 'In-Memory Demo Database'
          : 'PostgreSQL (falls back to in-memory demo data if unreachable)';
      console.log(`====================================================`);
      console.log(` NAWI-ReportPro Backend Server is running on port ${PORT}`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(` Data source: ${mode}`);
      console.log(` API Base URL: http://localhost:${PORT}/api`);
      console.log(` OIML R-76 Verification Engine: Active`);
      console.log(`====================================================`);
    });

  // Settle DB connectivity up front so the first login request never eats a
  // multi-second connection timeout before falling back to the demo database.
  if (typeof prisma.__probeConnection === 'function') {
    return prisma.__probeConnection().then(boot, boot);
  }
  return Promise.resolve(boot());
}

// Start Server when run directly
if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;

