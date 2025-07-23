import express from 'express';
import path from 'path';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config();

const app = express();

connectDB();

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
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// Handle 404
app.use('*', (req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

const PORT = process.env.ADMIN_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Admin Panel running on port ${PORT}`);
});

export default app;
