import express from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import mongoose from 'mongoose';
import dbActions from '../helpers/db_actions.js';
import dbHelpers from '../helpers/helper_functions.js';
import WebUsers from '../models/WebUsers.js';

const { users_count_comparision, transactions_count_comparision, supportTickets_count_comparision } = dbActions;
const {
    total_users,
    total_transactions,
    TotalSupportTickets
} = dbHelpers
const router = express.Router();

// Middleware to check if admin is logged in
const requireAuth = (req, res, next) => {
  if (req.session.isLoggedIn) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// Login page
router.get('/login', (req, res) => {
  if (req.session.isLoggedIn) {
    return res.redirect('/admin/dashboard');
  }
  res.render('login', {
    title: 'Admin Login',
    error: req.session.error || null
  });
  req.session.error = null;
});

// Handle login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Simple admin authentication
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      req.session.isLoggedIn = true;
      req.session.adminUser = username;
      res.redirect('/admin/dashboard');
    } else {
      req.session.error = 'Invalid credentials';
      res.redirect('/admin/login');
    }
  } catch (error) {
    req.session.error = 'Login failed';
    res.redirect('/admin/login');
  }
});

// Dashboard
router.get('/', requireAuth, async (req, res) => {
  res.redirect('/admin/dashboard');
});

router.get('/dashboard', async (req, res) => {
  try {

    const defaultData = {
      totalRevenue: 12345.67,
      newUsers: 456,
      transactions: 12,
      supportTickets: 3,
      recentTransactions: []
    };

    const users_diff = await users_count_comparision();
    const transactions_diff = await transactions_count_comparision();
    const supportTicketsDiff = await supportTickets_count_comparision();
    
    const usersCount = await total_users();
    const TransactionsCount = await total_transactions();
    const supportTicketsCount = await TotalSupportTickets();
    
    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.adminUser,
      data: defaultData,
      usersCount: usersCount,
      users_diff,
      TransactionsCount,
      transactions_diff,
      supportTicketsCount,
      supportTicketsDiff
    });
  } catch (error) {
    console.error('Dashboard error:', error.message);
    // Render with default data if API fails
    const defaultData = {
      totalRevenue: 12345.67,
      newUsers: 456,
      transactions: 12,
      supportTickets: 3,
      recentTransactions: []
    };

    const users_diff = 0
    const TransactionsCount = 11
    const transactions_diff = 0
    const supportTicketsDiff = 0
    const supportTicketsCount = 0
    
    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.adminUser,
      data: defaultData,
      tables: [],
      usersCount: 0,
      users_diff,
      TransactionsCount,
      transactions_diff
    });
  }
});

router.get('/subscriptionplans', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;
  const query = req.query.q?.trim() || '';

  const plansCollection = mongoose.connection.db.collection('subscriptionplans');

  const filter = query
    ? {
        name: { $regex: query, $options: 'i' },
      }
    : {};

  const plans = await plansCollection
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const total = await plansCollection.countDocuments(filter);

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ plans });
  }

  res.render('subscriptionplans', {
    title: 'Subscription Plans',
    user: req.user?.name || 'Admin',
    plans,
    query,
    page,
    limit,
    total,
  });
});

// Users management
router.get('/users', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;
  const searchQuery = req.query.q?.trim() || '';

  const usersCollection = mongoose.connection.db.collection('users');

  const filter = searchQuery
    ? {
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { email: { $regex: searchQuery, $options: 'i' } }
        ]
      }
    : {};

  const [users, total] = await Promise.all([
    usersCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    usersCollection.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit);

  // If AJAX request, return JSON
  if (req.xhr) {
    return res.json({ users, page, totalPages });
  }

  // Full page render
  res.render('users', {
    title: 'Users',
    user: req.user?.name || 'Admin',
    users,
    page,
    limit,
    totalPages,
    searchQuery
  });
});

// Help route
router.get('/help', async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const ticketsCollection = mongoose.connection.db.collection('supporttickets');

    const filter = query
      ? {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
            { message: { $regex: query, $options: 'i' } },
          ],
        }
      : {};

    const tickets = await ticketsCollection
      .find(filter)
      .sort({ _id: -1 }) // latest first
      .skip(skip)
      .limit(limit)
      .toArray();

    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ tickets });
    }

    // Initial full page render
    res.render('help', {
      title: 'Support Tickets',
      user: req.user?.name || 'Admin',
      tickets,
      searchQuery: query,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error loading help tickets:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Deposit route
router.get('/deposit', requireAuth, (req, res) => {
  res.render('deposit', {
    title: 'Deposit Transactions',
    user: req.session.adminUser
  });
});

// Withdraw route
router.get('/withdraw', requireAuth, (req, res) => {
  res.render('withdraw', {
    title: 'Withdrawal Transactions',
    user: req.session.adminUser
  });
});

// Wallet route
router.get('/wallet', requireAuth, (req, res) => {
  res.render('wallet', {
    title: 'Wallet',
    user: req.session.adminUser
  });
});

// Profile route

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const adminEmail = req.session.adminUser.email;

    let webUser = await WebUsers.findOne({ username: "admin" });

    if (!webUser) {
      const newUser = new WebUsers({
        username: "admin",
        firstname: "admin",
        lastname: "admin",
        orgname: "admin",
        location: "admin",
        email: "admin@gmail.com",
        phone: "123456789"
      });

      await newUser.save();

      webUser = await WebUsers.findOne({ username: "admin" });

      console.log(" WebUser created successfully");
    }

    res.render('profile', {
      title: 'Profile',
      user: req.session.adminUser,
      webUser: webUser
    });
  } catch (err) {
    console.error('Error fetching WebUser:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Settings route
router.get('/settings', requireAuth, (req, res) => {
  res.render('settings', {
    title: 'Settings',
    user: req.session.adminUser
  });
});

// Transactions
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.BACKEND_API_URL}/admin/transactions`);
    const transactions = response.data.data;

    res.render('transactions', {
      title: 'Transactions',
      user: req.session.adminUser,
      transactions: transactions
    });
  } catch (error) {
    console.error('Transactions fetch error:', error.message);
    res.render('transactions', {
      title: 'Transactions',
      user: req.session.adminUser,
      transactions: [],
      error: 'Failed to fetch transactions'
    });
  }
});

// Support tickets
router.get('/support', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.BACKEND_API_URL}/admin/support`);
    const tickets = response.data.data;
    
    res.render('support', {
      title: 'Support Tickets',
      user: req.session.adminUser,
      tickets: tickets
    });
  } catch (error) {
    console.error('Support fetch error:', error.message);
    res.render('support', {
      title: 'Support Tickets',
      user: req.session.adminUser,
      tickets: [],
      error: 'Failed to fetch support tickets'
    });
  }
});

// Settings
router.get('/settings', requireAuth, (req, res) => {
  res.render('settings', {
    title: 'Settings',
    user: req.session.adminUser
  });
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/admin/login');
  });
});

//FAQs
router.get('/faqs', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const query = req.query.q || '';
  const skip = (page - 1) * limit;

  const faqsCollection = mongoose.connection.db.collection('faqs');

  const filter = query ? { name: { $regex: query, $options: 'i' } } : {};
  const faqs = await faqsCollection.find(filter).sort({ date_created: -1 }).skip(skip).limit(limit).toArray();

  if (req.xhr) {
    return res.json({ faqs });
  }

  res.render('faqs', { title: 'FAQs', faqs, searchQuery: query, page, limit, user: req.session.adminUser });
});

export default router;
