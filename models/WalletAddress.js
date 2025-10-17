import mongoose from "mongoose";

const walletAddressSchema = new mongoose.Schema({
  userId: {
    type: String,
    ref: "User",
    required: true,
  },
  firebase_uid: {
    type: String,
    ref: 'users',
    index: true
  },
  chain: {
    type: String,
    enum: ["bsc", "btc", "ltc"],
    required: true,
  },
  asset: {
    type: String,
    enum: ["BNB", "USDT", "USDC", "BTC", "LTC"],
    required: true,
  },
  address: {
    type: String,
    required: true,
    unique: true,
  },
  derivationPath: {
    type: String,
  },
  idx: {
    type: Number,
    required: true,
  },
  privateKey: {
    type: String,
    required: true,
    default: ""
  },
}, { timestamps: { createdAt: "created_at" } });

export default mongoose.model("WalletAddress", walletAddressSchema);
