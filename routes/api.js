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

router.use('/faqs', faqRoutes);
router.use('/help', HelpRoutes);
router.use('/users', UserRoutes);
router.use('/transactions', transactionRoutes);
router.use('/subscriptionplans', subscriptionRoutes);
router.use('/daily-rewards', ClaimRewardRoutes);
router.use('/withdrawals', withdrawal_handles);

// Crypto Stuff

router.use('/deposit-address', alchemyy_deposits);
router.use('/wallet', wallet_balance_handles);

export default router;
