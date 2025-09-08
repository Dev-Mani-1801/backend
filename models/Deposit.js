import mongoose from "mongoose";

const depositSchema = new mongoose.Schema({
  userId: {
    type: String,
    ref: "User",
    required: true,
  },
  asset: {
    type: String,
    required: true,
  },
  chain: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  txHash: {
    type: String,
    required: true,
    unique: true,
  },
  amountNumeric: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
  },
  confirmations: {
    type: Number,
    required: true,
  },
  credited: {
    type: Boolean,
    default: false,
  },
  creditedAt: {
    type: Date,
  },
}, { timestamps: true });

export default mongoose.model("Deposit", depositSchema);
