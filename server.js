const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for development
}));

// CORS
app.use(cors());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'admin-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

// Handle 404
app.use('*', (req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

const PORT = process.env.ADMIN_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Admin Panel running on port ${PORT}`);
});

module.exports = app;
