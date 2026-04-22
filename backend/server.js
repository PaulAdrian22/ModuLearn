// MODULEARN Backend Server
// Main entry point for the API server

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/database');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const questionRoutes = require('./routes/questionRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const progressRoutes = require('./routes/progressRoutes');
const bktRoutes = require('./routes/bktRoutes');
const learningSkillRoutes = require('./routes/learningSkillRoutes');
const adminRoutes = require('./routes/adminRoutes');
const simulationRoutes = require('./routes/simulationRoutes');

// Initialize Express app
const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const allowedRequestLogModes = new Set(['off', 'dev', 'tiny', 'errors-only']);
const configuredRequestLogMode = String(process.env.REQUEST_LOG_MODE || '').trim().toLowerCase();
const requestLogMode = allowedRequestLogModes.has(configuredRequestLogMode)
  ? configuredRequestLogMode
  : (isProduction ? 'errors-only' : 'dev');

const configuredUploadCacheMaxAgeSeconds = Number(process.env.UPLOAD_CACHE_MAX_AGE_SECONDS);
const uploadCacheMaxAgeSeconds = Number.isFinite(configuredUploadCacheMaxAgeSeconds)
  ? Math.max(0, Math.floor(configuredUploadCacheMaxAgeSeconds))
  : (isProduction ? 86400 : 0);
const shouldUseUploadCaching = uploadCacheMaxAgeSeconds > 0;

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "http://localhost:5000", "http://localhost:3000"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
})); // Security headers

const corsOriginConfig = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isNetlifyOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.hostname.endsWith('.netlify.app');
  } catch {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests and same-origin requests with no Origin header.
    if (!origin) return callback(null, true);

    if (corsOriginConfig.includes(origin)) {
      return callback(null, true);
    }

    if (isNetlifyOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(compression()); // Compress responses
if (requestLogMode !== 'off') {
  const morganFormat = requestLogMode === 'tiny' || requestLogMode === 'errors-only' ? 'tiny' : 'dev';
  const morganOptions = requestLogMode === 'errors-only'
    ? { skip: (_, res) => res.statusCode < 400 }
    : undefined;

  app.use(morgan(morganFormat, morganOptions));
}
// Large lesson payloads (rich sections + assessments) can exceed default 100kb.
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  etag: true,
  lastModified: true,
  maxAge: shouldUseUploadCaching ? uploadCacheMaxAgeSeconds * 1000 : 0,
  setHeaders: (res, filePath) => {
    if (!shouldUseUploadCaching) return;

    if (/\.(?:png|jpe?g|gif|webp|svg|mp4|webm)$/i.test(filePath)) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${uploadCacheMaxAgeSeconds}, stale-while-revalidate=3600`
      );
    }
  }
}));

// Serve simulation webp assets (grouped by perspective) for the rebuilt Simulation page
app.use('/sim-assets', express.static(path.join(__dirname, '..', 'Simulations', 'simulation webp grouped by perspective'), {
  etag: true,
  lastModified: true,
  maxAge: shouldUseUploadCaching ? uploadCacheMaxAgeSeconds * 1000 : 0
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/bkt', bktRoutes);
app.use('/api/learning-skills', learningSkillRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/simulations', simulationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'MODULEARN API is running',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to list all routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  res.json({ routes });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'MODULEARN API',
    version: '1.0.0',
    description: 'Web-Based Individualized Learning Platform on Computer Hardware Servicing',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      modules: '/api/modules',
      questions: '/api/questions',
      assessments: '/api/assessments',
      progress: '/api/progress',
      bkt: '/api/bkt',
      learningSkills: '/api/learning-skills'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('Failed to connect to database. Please check your database configuration.');
      process.exit(1);
    }
    
    // Start listening
    app.listen(PORT, () => {
      console.log('========================================');
      console.log(`MODULEARN API Server`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Server running on port ${PORT}`);
      console.log(`API URL: http://localhost:${PORT}`);
      console.log('========================================');
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });

  startServer();
}

module.exports = app;
