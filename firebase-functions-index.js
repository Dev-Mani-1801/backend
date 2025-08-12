const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const mongoose = require('mongoose');

// Import your routes (convert to CommonJS)
// const adminRoutes = require('./routes/admin-commonjs');
// const apiRoutes = require('./routes/api-commonjs');

const app = express();

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority');
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

connectDB();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false
}));

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'admin-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Bitcoin Mining Backend API is running on Firebase Functions',
    timestamp: new Date().toISOString()
  });
});

// Routes (you'll need to convert your ES6 modules to CommonJS)
// app.use('/admin', adminRoutes);
// app.use('/api', apiRoutes);

// Handle 404
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);
