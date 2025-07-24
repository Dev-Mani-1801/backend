// models/SupportTickets.js
import mongoose from 'mongoose';

const SupportTicketSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  }
});

const SupportTicket = mongoose.models.SupportTicket || mongoose.model('SupportTicket', SupportTicketSchema);
export default SupportTicket;
