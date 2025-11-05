import express from 'express';
import NotificationPreference from '../../models/NotificationPreferences.js';
import mongoose from 'mongoose';

const router = express.Router();

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    let user_preferences = await NotificationPreference.findOne({ user: userId });

    if (!user_preferences) {
      user_preferences = new NotificationPreference({
        user: userId,
        email: false,
        push: false,
        sms: false,
      });
      await user_preferences.save();
    }

    res.status(200).json({
      success: true,
      user_preferences
    });
  } catch (err) {
    console.error('Error fetching/creating notification preferences:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, push, sms } = req.body;

    // Find and update, or create if not exists
    let user_preferences = await NotificationPreference.findOneAndUpdate(
      { user: userId },
      { 
        email: email ?? false, 
        push: push ?? false, 
        sms: sms ?? false 
      },
      { new: true, upsert: true } // return updated doc, create if not found
    );

    res.status(200).json({
      success: true,
      user_preferences,
    });
  } catch (err) {
    console.error('Error updating notification preferences:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

export default router;