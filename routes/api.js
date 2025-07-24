import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import Transaction from '../models/SubscriptionPlan.js';

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

// Update user status
router.put('/users/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const response = await axios.put(
      `${process.env.BACKEND_API_URL}/admin/users/${id}/status`,
      { isActive }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Update user status error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user status' 
    });
  }
});

// Delete user
router.delete('/users/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const response = await axios.delete(
      `${process.env.BACKEND_API_URL}/admin/users/${id}`
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Delete user error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user' 
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

router.post('/subscriptionplans/create', async (req, res) => {
  try {
    const { name, hashrate, duration, maintenance_cost, plan_cost } = req.body;

    const newPlan = new SubscriptionPlan({
      id: uuidv4(),
      name,
      hashrate: parseFloat(hashrate),
      duration: parseInt(duration),
      maintenance_cost: parseFloat(maintenance_cost),
      plan_cost: parseFloat(plan_cost),
    });

    await newPlan.save();

    console.log("Plan Saved!!");

    res.redirect('/admin/subscriptionplans');
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
