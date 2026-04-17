import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import asyncHandler from 'express-async-handler';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import winston from 'winston';
import metadata from '../config/metadata.json' assert { type: 'json' };

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Import engines
import PromptPlanner from '../engine/planner.js';
import CodeGenerator from '../engine/generator.js';
import CodeStreamer from '../engine/streamer.js';
import PreviewEngine from '../engine/preview.js';
import { generateID, ID_TYPES } from '../utils/id.js';

// Import routes
import apiRoutes from './routes/api.js';
import projectRoutes from './routes/projects.js';
import deployRoutes from './routes/deploy.js';

// Initialize engines
const planner = new PromptPlanner();
const generator = new CodeGenerator();
const streamer = new CodeStreamer();
const preview = new PreviewEngine();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.xova.pro'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss://*.xova.pro'],
      frameSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false, // Required for iframe previews
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'https://*.xova.pro'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Compression
app.use(compression({
  level: 6,
  threshold: 1024
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: metadata.security.rateLimiting.windowMs,
  max: metadata.security.rateLimiting.maxRequests,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({ error: 'Rate limit exceeded' });
  }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip
    });
  });
  next();
});

// Static files (frontend)
app.use(express.static(join(__dirname, '../frontend'), {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// API routes
app.use('/api', apiRoutes({ planner, generator, streamer, preview }));
app.use('/api/projects', projectRoutes());
app.use('/api/deploy', deployRoutes());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: metadata.system.version,
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// System info endpoint
app.get('/api/system', (req, res) => {
  res.json({
    system: metadata.system,
    capabilities: metadata.system.capabilities,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('404 Not Found', { path: req.path, method: req.method });
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // Don't leak error details in production
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack })
  });
});

// Graceful shutdown
const server = app.listen(PORT, () => {
  logger.info(`🚀 XOVA AI Engine server running on port ${PORT}`, {
    environment: process.env.NODE_ENV,
    version: metadata.system.version
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Export for testing
export { app, planner, generator, streamer, preview, logger };
export default app;
