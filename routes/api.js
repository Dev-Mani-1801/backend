import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import WebUsers from '../models/WebUsers.js';
import FAQ from '../models/FAQs.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

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

router.delete('/subscriptionplans/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await SubscriptionPlan.findOneAndDelete({ id });

    if (!result) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.status(200).json({ message: 'Plan deleted' });
  } catch (err) {
    console.error('Error deleting plan:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/help/:id/delete', async (req, res) => {
  try {
    const ticketsCollection = mongoose.connection.db.collection('supporttickets');
    const id = new mongoose.Types.ObjectId(req.params.id);
    await ticketsCollection.deleteOne({ _id: id });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error deleting ticket:', err);
    res.sendStatus(500);
  }
});

router.post('/help/reply', async (req, res) => {
  const { email, message } = req.body;

  try {
    
    console.log(`Email sent to ${email} with message: ${message}`);

    res.sendStatus(200);
  } catch (err) {
    console.error('Failed to send email:', err);
    res.sendStatus(500);
  }
});

// Create new FAQ
router.post('/faqs/create', async (req, res) => {
  try {
    const { name, message } = req.body;
    const faq = new FAQ({ name, message });
    await faq.save();
    res.redirect('/admin/faqs');
  } catch (err) {
    console.error('Error creating FAQ:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Delete FAQ
router.delete('/faqs/:id', async (req, res) => {
  try {
    await FAQ.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete FAQ failed:', err);
    res.status(500).json({ error: 'Delete failed' });
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

    res.redirect('/admin/profile');
    
  } catch (err) {
    console.error('Error saving WebUser:', err);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
