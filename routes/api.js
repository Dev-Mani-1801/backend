import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import WebUsers from '../models/WebUsers.js';
import mongoose from 'mongoose';
import transactionRoutes from './api_routes/transactions.js';
import subscriptionRoutes from './api_routes/subscriptions.js';
import faqRoutes from './api_routes/faqs.js';
import UserRoutes from './api_routes/users.js'
import HelpRoutes from './api_routes/support.js'
import ClaimRewardRoutes from './api_routes/dailyRewardController.js'

import alchemyy_deposits from './api_routes/alchemy_deposit.js';
import wallet_balance_handles from './api_routes/balance.js';
import withdrawal_handles from './api_routes/withdrawal_routes.js';
import firebase_token_handle from './api_routes/firebase_notifications.js';
import lightning_handles from './api_routes/lightning-handle.js';
import notification_handles from './api_routes/notification_handles.js'
import google_ads_handle from './api_routes/google_ads.js'
import delete_handles from './api_routes/delete_handles.js'
import security_handles from './api_routes/security_handles.js'
import user_mining_handles from './api_routes/user-mining-handles.js'
import claim_daily_miner from './api_routes/daily-miner-handles.js'

const router = express.Router();

// Middleware to check if admin is logged in for API routes
const requireAuth = (req, res, next) => {
  if (req.session.isLoggedIn) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

// Get dashboard stats
router.get('/dashboard-stats', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.BACKEND_API_URL}/admin/dashboard`);
    res.json(response.data);
  } catch (error) {
    console.error('Dashboard stats error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard stats' 
    });
  }
});

// Update support ticket status
router.put('/support/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const response = await axios.put(
      `${process.env.BACKEND_API_URL}/admin/support/${id}/status`,
      { status }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Update ticket status error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update ticket status' 
    });
  }
});

router.post('/profile/save', requireAuth, async (req, res) => {
  try {
    const {
      firstname,
      lastname,
      orgname,
      location,
      email,
      phone
    } = req.body;

    const existingUser = await WebUsers.findOne({ username: "admin" });

    if (existingUser) {
      // Update existing
      existingUser.firstname = firstname;
      existingUser.lastname = lastname;
      existingUser.orgname = orgname;
      existingUser.location = location;
      existingUser.phone = phone;
      existingUser.email = email;

      await existingUser.save();
    } else {
      // Create new
      const newUser = new WebUsers({
        firstname,
        lastname,
        orgname,
        location,
        email,
        phone: phone
      });

      await newUser.save();
    }

    // Set success message in session
    req.session.successMessage = 'Profile updated successfully!';
    res.redirect('/admin/profile');

  } catch (err) {
    console.error('Error saving WebUser:', err);
    req.session.errorMessage = 'Failed to update profile. Please try again.';
    res.redirect('/admin/profile');
  }
});

router.get("/referrals", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "Referral code is required",
      });
    }

    // Directly query MongoDB collection instead of User model
    const usersCollection = mongoose.connection.collection("users");

    const count = await usersCollection.countDocuments({
      referralUsed: { $regex: `^${code}$`, $options: "i" }, // case-insensitive
    });

    res.json({
      success: true,
      referralCode: code,
      count,
    });
  } catch (error) {
    console.error("Fetching error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user referrals",
    });
  }
});


router.use('/faqs', faqRoutes);
router.use('/help', HelpRoutes);
router.use('/users', UserRoutes);
router.use('/transactions', transactionRoutes);
router.use('/subscriptionplans', subscriptionRoutes);
router.use('/daily-rewards', ClaimRewardRoutes);
router.use('/withdrawals', withdrawal_handles);
router.use('/notification-preferences', notification_handles);

// Crypto Stuff

router.use('/deposit-address', alchemyy_deposits);
router.use('/wallet', wallet_balance_handles);
router.use('/firebase_tokens', firebase_token_handle);
router.use('/lightning-handles', lightning_handles);
router.use('/google-ads', google_ads_handle);

router.use('/delete-handles', delete_handles);
router.use('/security', security_handles);
router.use('/user_mining', user_mining_handles);
router.use('/claim_daily_miner', claim_daily_miner);

export default router;
