import mongoose from "mongoose";

const UserMiningSchema = new mongoose.Schema({
  user: {
    type: String,
    ref: 'users',
    required: true
  },
  firebase_uid: {
    type: String,
    ref: 'users',
    index: true
  },
  hashpower: {
    type: Number,
    required: true,
    min: 0
  },
  rewarded_ads_watched: {
    type: Number,
    required: true,
    min: 0
  },
  random_ads_watched: {
    type: Number,
    required: true,
    min: 0
  },
  mining_isactive: {
    type: Boolean,
    default: false
  },
  start_time: {
    type: Number,
    default: null
  },
  stop_time: {
    type: Number,
    default: null
  },
}, { timestamps: true });

export default mongoose.model("UserMining", UserMiningSchema);
