require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Connection String
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://azartechnet_db_user:admin@cluster0.musk1ed.mongodb.net/coding-test-platform';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Configuration
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

// Root Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Coding Assessment Platform API is running',
    status: 'Healthy',
    timestamp: new Date()
  });
});

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date()
  });
});

// API Routes
app.use('/api', apiRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// MongoDB Connection and Server Start
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB Connected Successfully');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health Check: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
  });