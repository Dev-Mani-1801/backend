import express from 'express';
import mongoose from 'mongoose';
import UserMiningDetail from "../../models/UserMiningDetails.js";
import BalanceHistory from "../../models/BalanceHistory.js";
import Balance from "../../models/Balance.js";
import DailyRewardClaim from '../../models/DailyRewardClaim.js';
import { parse } from 'date-fns';

const router = express.Router();

const BTC_PER_HASHPOWER_PER_SEC = 0.000000000001;
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;
// const MAX_MINING_DURATION_MS = 10 * 60 * 1000;

const MONGO_URI =
  "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

// GET user mining details by userId
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await mongoose.connect(MONGO_URI);

    let mining_details = await UserMiningDetail.findOne({ user: userId });
    if (!mining_details) {
      return res.status(404).json({ success: false, message: "Mining details not found." });
    }

    const { start_time, hashpower, offset, local_start_time } = mining_details;

    if (!start_time || !hashpower || hashpower <= 0) {
      return res.json({
        success: true,
        mining_details,
        calculated_btc: 0,
        message: "Mining not active or invalid hashpower.",
      });
    }

    // --- LOCAL TIME CALCULATION ---
    const userOffsetMin = Number(offset) || 0;

    const nowUTC = new Date();
    const nowLocal = new Date(nowUTC.getTime() - userOffsetMin * 60 * 1000);

    // Try to parse local_start_time safely
    let localStart;
    try {
      if (local_start_time) {
        localStart = parse(local_start_time, 'dd/MM/yyyy, h:mm:ss a', new Date());
        if (isNaN(localStart)) throw new Error("Invalid parse");
      } else {
        localStart = new Date(start_time - userOffsetMin * 60 * 1000);
      }
    } catch {
      // Fallback: extract numbers manually if locale symbols cause parse() failure
      const parts = local_start_time?.match(/\d+/g);
      if (parts && parts.length >= 6) {
        localStart = new Date(parts[2], parts[1] - 1, parts[0], parts[3], parts[4], parts[5]);
      } else {
        localStart = new Date(start_time - userOffsetMin * 60 * 1000);
      }
    }

    console.log("Local Start Time: ", localStart);
    console.log("Current Local Time: ", nowLocal);

    const startDayLocal = new Date(
      nowLocal.getFullYear(),
      nowLocal.getMonth(),
      nowLocal.getDate()
    );
    const startDateLocal = new Date(
      localStart.getFullYear(),
      localStart.getMonth(),
      localStart.getDate()
    );

    const isSameLocalDay =
      startDateLocal.getFullYear() === startDayLocal.getFullYear() &&
      startDateLocal.getMonth() === startDayLocal.getMonth() &&
      startDateLocal.getDate() === startDayLocal.getDate();

    const nextMidnightLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate() + 1);

    console.log("Store Start DateTime Local: ", startDateLocal);
    console.log("Current DateTime Local: ", startDayLocal);
    console.log("Same Day ? ", isSameLocalDay);
    console.log(`Time left until reset: ${((nextMidnightLocal - nowLocal) / (1000 * 60)).toFixed(2)} mins (${((nextMidnightLocal - nowLocal) / (1000 * 60 * 60)).toFixed(2)} hrs)`);

    // Calculate elapsed time
    const elapsedLocalMs = nowLocal.getTime() - localStart.getTime();
    const elapsedLocalHours = elapsedLocalMs / (1000 * 60 * 60);
    const elapsedLocalMins = elapsedLocalMs / (1000 * 60);

    console.log("Local Elapsed (hours):", elapsedLocalHours.toFixed(2));
    console.log("Local Elapsed (Mins):", elapsedLocalMins.toFixed(2));

    let calculated_btc = 0;

    if (isSameLocalDay) {
      // Within allowed duration (10 mins for testing)
      const miningDurationSec = Math.min(elapsedLocalMs / 1000, MAX_MINING_DURATION_MS / 1000);
      calculated_btc = hashpower * BTC_PER_HASHPOWER_PER_SEC * miningDurationSec;
      console.log("Total Mined BTC:", calculated_btc);
    } else {
      // Exceeded mining duration → reset mining
      const btcToTransfer = hashpower * BTC_PER_HASHPOWER_PER_SEC * 24 * 3600;

      const miningDurationSec = Math.min(elapsedLocalMs / 1000, MAX_MINING_DURATION_MS / 1000);
      calculated_btc = hashpower * BTC_PER_HASHPOWER_PER_SEC * miningDurationSec;

      console.log("UserID:", userId);
      console.log("Mining Details:", mining_details);

      const user_balance = await Balance.findOne({ user: userId });
      if (user_balance) {
        user_balance.BTC_DEPOSIT =
          parseFloat(user_balance.BTC_DEPOSIT?.toString() || "0") + btcToTransfer;
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
            start_time: 0,
            stop_time: 0,
            local_start_time: null,
            local_stop_time: null
          },
        }
      );

      const todayLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
      await BalanceHistory.findOneAndUpdate(
        { user: userId, date: todayLocal },
        {
          $set: {
            user: userId,
            date: todayLocal,
            balances: {
              BTC: calculated_btc,
              BNB: user_balance?.BNB ?? 0,
              USDT: user_balance?.USDT ?? 0,
              USDC: user_balance?.USDC ?? 0,
              LTC: user_balance?.LTC ?? 0,
            },
          },
        },
        { upsert: true, new: true }
      );

      await DailyRewardClaim.deleteMany({ userId: userId });

      calculated_btc = 0;
      mining_details = await UserMiningDetail.findOne({ user: userId });
    }

    return res.json({
      success: true,
      mining_details,
      calculated_btc: parseFloat(calculated_btc.toFixed(12)),
      message: "Mining details fetched successfully (local time based).",
    });
  } catch (err) {
    console.error("Error fetching mining details:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

// POST create or update user mining details
router.post("/", async (req, res) => {
  try {
    const { 
      user_id, 
      hashpower, 
      mining_isactive, 
      rewarded_ads_watched, 
      random_ads_watched, 
      start_time, 
      stop_time,
      local_start_time,
      local_stop_time,
      offset
    } = req.body;

    await mongoose.connect(MONGO_URI);

    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    let existingRecord = await UserMiningDetail.findOne({ user: user_id });

    const updateData = {};
    if (typeof hashpower === "number") updateData.hashpower = hashpower;
    if (typeof rewarded_ads_watched === "number") updateData.rewarded_ads_watched = rewarded_ads_watched;
    if (typeof random_ads_watched === "number") updateData.random_ads_watched = random_ads_watched;
    if (typeof mining_isactive === "boolean") updateData.mining_isactive = mining_isactive;
    if (typeof stop_time === "number") updateData.stop_time = stop_time;


    if (typeof local_start_time === "string" && local_start_time.trim() !== "") {
      if (!existingRecord || !existingRecord.local_start_time) {
        updateData.local_start_time = local_start_time;
      } else {
        updateData.local_start_time = existingRecord.local_start_time;
      }
    }

    if (typeof local_stop_time === "string" && local_stop_time.trim() !== "") {
      updateData.local_stop_time = local_stop_time;
    }

    if (typeof offset === "number") updateData.offset = offset;

    if (typeof start_time === "number") {
      const now = Date.now();

      if (!existingRecord || !existingRecord.start_time) {
        // No record found → set start_time
        updateData.start_time = start_time;
      } else {
        const lastStart = Number(existingRecord.start_time);
        const diff = now - lastStart;
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (diff >= twentyFourHours) {
          // More than 24h passed → reset start_time
          updateData.start_time = 0;
        } else {
          // Less than 24h → keep the old start_time
          updateData.start_time = existingRecord.start_time;
        }
      }
    }

    const mining_details = await UserMiningDetail.findOneAndUpdate(
      { user: user_id },
      { $set: updateData, user: user_id },
      { new: true, upsert: true }
    );

    console.log("Setting User Data: ", updateData, user_id);

    res.json({ success: true, mining_details });
  } catch (err) {
    console.error("Error saving mining details:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
