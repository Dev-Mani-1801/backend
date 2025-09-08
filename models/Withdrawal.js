import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const withdrawalSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: uuidv4,
  },
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
  toAddress: {
    type: String,
    required: true,
  },
  amountNumeric: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
  },
  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "SENT", "CONFIRMED", "FAILED"],
    default: "PENDING",
  },
  txHash: String,
  approvedBy: String,
  approvedAt: Date,
}, { timestamps: { createdAt: "created_at", updatedAt: true } });

export default mongoose.model("Withdrawal", withdrawalSchema);
