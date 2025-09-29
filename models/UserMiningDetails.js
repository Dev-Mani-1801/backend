import mongoose from "mongoose";

const UserMiningSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  hashpower: {
    type: Number,
    required: true,
    min: 0
  },
  mining_isactive: {
    type: Boolean,
    default: false
  },
}, { timestamps: true });

export default mongoose.model("UserMining", UserMiningSchema);
