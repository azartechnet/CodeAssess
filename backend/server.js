require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://azartechnet_db_user:admin@cluster0.musk1ed.mongodb.net/coding-test-platform';

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for easy development & Vercel deployment
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Health check / Root
app.get('/', (req, res) => {
  res.json({
    message: "Coding Assessment Platform API is running",
    status: "Healthy",
    time: new Date()
  });
});

// Database Connection
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB successfully.");
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
