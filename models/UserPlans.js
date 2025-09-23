import mongoose from "mongoose";

const UserplanSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  crypto: {
    type: String,
    enum: ['BTC', 'ETH', 'USDT', 'USDC'],
    default: null
  },
  chain: {
    type: String,
    enum: ['BTC', 'BNB'],
    default: null
  },
  amount: { type: mongoose.Schema.Types.Decimal128, default: 0 },
  hashrate: {
    type: Number,
    required: true,
    min: 0
  },
  plan_id: {
    type: String,
    default: null
  },
  paid: {
    type: Boolean,
    default: false
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
}, { timestamps: true });

export default mongoose.model("Userplan", UserplanSchema);