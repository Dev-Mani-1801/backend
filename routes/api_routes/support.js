import express from 'express';
import SupportTicket from '../../models/SupportTicket.js';
import mongoose from 'mongoose';

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { user, name, email, message } = req.body;

    if (!user || !name || !email || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const ticket = new SupportTicket({
      user,
      name,
      email,
      message
    });

    await ticket.save();

    res.status(201).json({ success: true, ticket });
  } catch (err) {
    console.error('Error creating support ticket:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.delete('/:id/delete', async (req, res) => {
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

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const support_tickets = await SupportTicket.find({ user: userId }).sort({ date_created: -1 });

    res.status(200).json({
      success: true,
      count: support_tickets.length,
      support_tickets
    });
  } catch (err) {
    console.error('Error fetching user support_tickets:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.post('/reply', async (req, res) => {
  const { email, message } = req.body;

  try {
    
    console.log(`Email sent to ${email} with message: ${message}`);

    res.sendStatus(200);
  } catch (err) {
    console.error('Failed to send email:', err);
    res.sendStatus(500);
  }
});

export default router;