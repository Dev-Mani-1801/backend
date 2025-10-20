import express from 'express';
import mongoose from 'mongoose';
import UserMiningDetail from "../models/UserMiningDetails.js";
import Balance from "../models/Balance.js";

const router = express.Router();

const BTC_PER_HASHPOWER_PER_SEC = 0.000000000001;
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;
// const MAX_MINING_DURATION_MS = 10 * 60 * 1000;

const MONGO_URI =
  "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

// GET user mining details by userId
    const userId  = "68f343714c6a2f6c5835d668";
    await mongoose.connect(MONGO_URI);

    const user_balance = await Balance.findOne({ user: userId });

    if (user_balance) {
        user_balance.BTC = 0;
        await user_balance.save();
    }

    await UserMiningDetail.findOneAndUpdate(
    { user: userId },
    {
        $set: {
        hashpower: 0,
        mining_isactive: false,
        rewarded_ads_watched: 0,
        random_ads_watched: 0,
        start_time: null,
        stop_time: null,
        local_start_time: null,
        local_stop_time: null
        },
    }
    );

    console.log("Data reset Done!!")

