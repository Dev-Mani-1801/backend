// models/Transaction.js
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  method_crypto: {
    type: Boolean,
    default: false
  },
  method_bank_transfer: {
    type: Boolean,
    default: false
  },
  method_payment_gateway: {
    type: Boolean,
    default: false
  },
  crypto_type: {
    type: String,
    enum: ['BTC', 'ETH', 'USDT', 'BNB', 'LTC'],
    default: null
  },
  crypto_wallet_address: {
    type: String,
    default: null
  },
  transaction_id: {
    type: String,
    required: true,
    unique: true
  },
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'subscriptionplans',
    required: true
  },
  date_created: {
    type: Date,
    default: Date.now
  }
});

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
export default Transaction;
