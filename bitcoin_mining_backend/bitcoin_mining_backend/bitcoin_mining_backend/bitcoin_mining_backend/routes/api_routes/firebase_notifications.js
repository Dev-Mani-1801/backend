import express from 'express';
import FirebaseNotifications from '../../models/FirebaseNotificationModels.js';
// import mongoose from 'mongoose';

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { user_id, token } = req.body;

    if (!user_id || !token) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const ticket = await FirebaseNotifications.findOneAndUpdate(
      { user_id },                        
      { user_id, token },                 
      { new: true, upsert: true }         
    );

    res.status(201).json({ success: true, ticket });
  } catch (err) {
    console.error('Error storing FCM:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});


export default router;