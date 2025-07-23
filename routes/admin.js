const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
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
    if (username === "testuser1" && password === "test1234") {
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

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    // Fetch dashboard data from backend API
    const response = await axios.get(`${process.env.BACKEND_API_URL}/admin/dashboard`);
    const dashboardData = response.data.data;
    
    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.adminUser,
      data: dashboardData
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
    
    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.adminUser,
      data: defaultData
    });
  }
});

// Users management
router.get('/users', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.BACKEND_API_URL}/admin/users`);
    const users = response.data.data;
    
    res.render('users', {
      title: 'Users Management',
      user: req.session.adminUser,
      users: users
    });
  } catch (error) {
    console.error('Users fetch error:', error.message);
    res.render('users', {
      title: 'Users Management',
      user: req.session.adminUser,
      users: [],
      error: 'Failed to fetch users'
    });
  }
});

// Help route
router.get('/help', requireAuth, (req, res) => {
  res.render('help', {
    title: 'Help & Support',
    user: req.session.adminUser
  });
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
router.get('/profile', requireAuth, (req, res) => {
  res.render('profile', {
    title: 'Profile',
    user: req.session.adminUser
  });
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

module.exports = router;
