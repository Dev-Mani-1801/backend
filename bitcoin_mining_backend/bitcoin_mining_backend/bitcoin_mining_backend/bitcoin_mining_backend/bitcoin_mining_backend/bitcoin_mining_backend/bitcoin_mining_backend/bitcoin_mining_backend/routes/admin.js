import express from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import mongoose from 'mongoose';
import dbActions from '../helpers/db_actions.js';
import dbHelpers from '../helpers/helper_functions.js';
import WebUsers from '../models/WebUsers.js';
import DailyReward from "../models/DailyReward.js";
import Withdrawal from "../models/Withdrawal.js";
import FirebaseNotifications from "../models/FirebaseNotificationModels.js";
import DeleteRequests from '../models/DeleteRequests.js';

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
    // Find user in MongoDB
    const adminUser = await WebUsers.findOne({
      username: username
    });

    if (adminUser && password === 'admin@123') {
      req.session.isLoggedIn = true;
      req.session.adminUser = adminUser.username;
      req.session.adminUserData = adminUser;
      res.redirect('/admin/dashboard');
    } else {
      req.session.error = 'Invalid credentials';
      res.redirect('/admin/login');
    }
  } catch (error) {
    console.error('Login error:', error);
    req.session.error = 'Login failed';
    res.redirect('/admin/login');
  }
});

// Register admin route (for initial setup)
router.post('/register-admin', async (req, res) => {
  try {
    const { firstname, lastname, username, orgname, location, email, phone, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await WebUsers.findOne({
      $or: [{ username }, { email }]
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this username or email already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new admin
    const newAdmin = new WebUsers({
      firstname,
      lastname,
      username,
      orgname,
      location,
      email,
      phone,
      password: hashedPassword,
      role: 'admin'
    });

    await newAdmin.save();

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      admin: {
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.role
      }
    });

  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register admin'
    });
  }
});

// Dashboard
router.get('/', requireAuth, async (req, res) => {
  res.redirect('/admin/dashboard');
});

router.get('/dashboard', requireAuth, async (req, res) => {
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

router.get('/usersubscriptions', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;
  const query = req.query.q?.trim() || '';

  const UserSubsCollection = mongoose.connection.db.collection('userplans');

  // filter for either plan name or user email
  const matchStage = query
    ? {
        $or: [
          { plan_id: { $regex: query, $options: 'i' } },
          { 'plan.name': { $regex: query, $options: 'i' } },
          { 'user.email': { $regex: query, $options: 'i' } }
        ],
      }
    : {};

  const pipeline = [
    // join with subscriptionplans
    {
      $lookup: {
        from: 'subscriptionplans',
        localField: 'plan_id',
        foreignField: 'id',
        as: 'plan',
      },
    },
    { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },

    // join with users collection
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },

    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        user: { _id: 1, email: 1 }, // only return id + email
        crypto: 1,
        chain: 1,
        amount: 1,
        amount_crypto: 1,
        hashrate: 1,
        paid: 1,
        plan: 1,
        createdAt: 1,
      },
    },
  ];

  const UserSubs = await UserSubsCollection.aggregate(pipeline).toArray();

  // count total
  const totalPipeline = [
    {
      $lookup: {
        from: 'subscriptionplans',
        localField: 'plan_id',
        foreignField: 'id',
        as: 'plan',
      },
    },
    { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $match: matchStage },
    { $count: 'total' },
  ];

  const totalResult = await UserSubsCollection.aggregate(totalPipeline).toArray();
  const total = totalResult[0]?.total || 0;

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ UserSubs, total });
  }

  res.render('usersubscriptions', {
    title: 'User Subscriptions',
    user: req.user?.name || 'Admin',
    UserSubs,
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

    console.log("WEBUSER: ", webUser);

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

    // Get messages and clear them immediately
    const successMessage = req.session.successMessage || null;
    const errorMessage = req.session.errorMessage || null;
    req.session.successMessage = null;
    req.session.errorMessage = null;

    res.render('profile', {
      title: 'Profile',
      user: req.session.adminUser,
      webUser: webUser,
      successMessage: successMessage,
      errorMessage: errorMessage
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

  res.render('Faqs', { title: 'FAQs', faqs, searchQuery: query, page, limit, user: req.session.adminUser });
});

export default router;

router.get("/daily-rewards", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const rewards = await DailyReward.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await DailyReward.countDocuments();

    res.render("dailyRewards", {
      title: "Daily Rewards",
      user: req.session.adminUser,
      rewards,
      page,
      limit,
      totalCount,
    });
  } catch (err) {
    console.error("Error fetching rewards:", err);
    res.status(500).send("Server error");
  }
});

router.get("/withdrawals", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    
    const query = {};
    if (search) {
      // Search by userId or status or txHash
      query.$or = [
        { userId: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
        { txHash: { $regex: search, $options: "i" } }
      ];
    }

    const withdrawals = await Withdrawal.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Withdrawal.countDocuments(query);

    res.render("withdraw", {
      title: "Withdrawals",
      user: req.user,
      withdrawals,
      page: Number(page),
      limit: Number(limit),
      total
    });
  } catch (err) {
    console.error("Error fetching rewards:", err);
    res.status(500).send("Server error");
  }
});

router.get('/fcm', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const searchQuery = req.query.q ? req.query.q.trim() : "";

    const query = {};
    if (searchQuery) {
      query.$or = [
        { token: { $regex: searchQuery, $options: 'i' } },
        { user_id: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    const tokens = await FirebaseNotifications.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (req.xhr) {
      // AJAX request -> return JSON
      return res.json({ tokens, page, limit });
    }

    // Normal request -> render EJS
    res.render('fcm_tokens', {
      title: 'Firebase Notifications',
      user: req.user,
      tokens,
      page,
      limit,
      searchQuery
    });
  } catch (err) {
    console.error('Error fetching FirebaseNotifications:', err);
    res.status(500).send('Server Error');
  }
});

router.get('/delete_requests', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const query = req.query.q ? req.query.q.trim() : '';

    // Match stage for email search
    const matchStage = query
      ? { 'user.email': { $regex: query, $options: 'i' } }
      : {};

    // Aggregation pipeline
    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          user: { _id: 1, email: 1 },
          reason: 1,
          createdAt: 1,
        },
      },
    ];

    // Run query on DeleteRequests model
    const deleteRequests = await DeleteRequests.aggregate(pipeline);

    // Total count
    const totalPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
      { $count: 'total' },
    ];

    const totalResult = await DeleteRequests.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;

    // Handle AJAX requests
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ deleteRequests, total });
    }

    // Render EJS page
    res.render('deleterequests', {
      title: 'Delete Requests',
      user: req.user ? req.user.name : 'Admin',
      deleteRequests,
      query,
      page,
      limit,
      total,
    });
  } catch (err) {
    console.error('Error fetching delete requests:', err);
    res.status(500).send('Internal Server Error');
  }
});
