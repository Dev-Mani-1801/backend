import mongoose from "mongoose";

const balanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  BNB: { type: mongoose.Schema.Types.Decimal128, default: 0 },
  USDT: { type: mongoose.Schema.Types.Decimal128, default: 0 },
  USDC: { type: mongoose.Schema.Types.Decimal128, default: 0 },
  BTC: { type: mongoose.Schema.Types.Decimal128, default: 0 },
  LTC: { type: mongoose.Schema.Types.Decimal128, default: 0 },
}, { timestamps: true });

export default mongoose.model("Balance", balanceSchema);
