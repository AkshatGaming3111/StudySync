require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDb } = require('./config/db');

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection caught:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception caught:', err);
});

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const plannerRoutes = require('./routes/planner');
const focusRoutes = require('./routes/focus');
const screentimeRoutes = require('./routes/screentime');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 5000;

// Security Headers (configured to allow external fonts & CDNs used by StudySync UI)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use('/api', generalLimiter);

// Static Files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/planner', plannerRoutes);
app.use('/api/focus', focusRoutes);
app.use('/api/screentime', screentimeRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'StudySync API Server', timestamp: new Date() });
});

// Fallback route for single page navigation
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ success: false, message: 'API route not found' });
  }
});

// Initialize database and start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`🚀 StudySync Server is running on port ${PORT}`);
      console.log(`🌐 Local Portal: http://localhost:${PORT}`);
      console.log(`==================================================`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server due to database initialization failure:', err);
  });
