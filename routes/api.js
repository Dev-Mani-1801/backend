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
import purchase_handles from './api_routes/purchases.js'
import mining_session_handles from './api_routes/mining-session-handles.js'

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

    // Count only ACTIVE users who used this referral code
    const count = await usersCollection.countDocuments({
      referralUsed: { $regex: `^${code}$`, $options: "i" }, // case-insensitive
      isActive: true  // Only count active users
    });

    console.log(`Referral count for ${code}: ${count} active users`);

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

// Get total referral rewards for a user
router.get("/referrals/rewards/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const ReferralRewardHistory = (await import("../models/ReferralRewardHistory.js")).default;

    // Get all processed rewards for this user as parent
    const rewards = await ReferralRewardHistory.find({
      parentUserId: userId,
      status: 'processed'
    }).lean();

    // Calculate total reward amount
    // Use high precision to handle very small amounts
    let totalRewards = 0;
    rewards.forEach(reward => {
      // Decimal128 values need to be converted properly
      const amountStr = reward.rewardAmount?.toString() || "0";
      const amount = parseFloat(amountStr);
      totalRewards += amount;
    });

    // Format with up to 16 decimal places to preserve precision for very small amounts
    // If the value is less than 0.00000001, show more decimal places
    let formattedTotal;
    if (totalRewards < 0.00000001 && totalRewards > 0) {
      // For very small amounts, use scientific notation or show more decimals
      formattedTotal = totalRewards.toFixed(16).replace(/\.?0+$/, ''); // Remove trailing zeros
    } else {
      formattedTotal = totalRewards.toFixed(8).replace(/\.?0+$/, ''); // Standard 8 decimals, remove trailing zeros
    }

    console.log(`[Referral Rewards API] Total rewards for user ${userId}: ${totalRewards} (formatted: ${formattedTotal})`);

    res.json({
      success: true,
      totalRewards: formattedTotal,
      totalRewardsRaw: totalRewards, // Also include raw value for precision
      rewardsCount: rewards.length,
      rewards: rewards.map(r => ({
        childUserId: r.childUserId,
        rewardDate: r.rewardDate,
        childDailyMining: r.childDailyMining?.toString() || "0",
        rewardAmount: r.rewardAmount?.toString() || "0",
        status: r.status
      }))
    });
  } catch (error) {
    console.error("Error fetching referral rewards:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch referral rewards",
      error: error.message
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
router.use('/purchases', purchase_handles);
router.use('/mining-sessions', mining_session_handles);

export default router;
