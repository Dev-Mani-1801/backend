import express from 'express';
import mongoose from 'mongoose';
import UserMiningDetail from "../../models/UserMiningDetails.js";
import BalanceHistory from "../../models/BalanceHistory.js";
import Balance from "../../models/Balance.js";
import DailyRewardClaim from '../../models/DailyRewardClaim.js';
import DailyFreeMiner from "../../models/DailyMiner.js";

const router = express.Router();

const BTC_PER_HASHPOWER_PER_SEC = 0.0000000000000001;
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;
// const MAX_MINING_DURATION_MS = 10 * 60 * 1000;

const MONGO_URI =
  "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

const isSameLocalDay = (date1, date2) =>
  date1.getFullYear() === date2.getFullYear() &&
  date1.getMonth() === date2.getMonth() &&
  date1.getDate() === date2.getDate();

// GET user mining details by userId
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { local_time } = req.query; // client local time
    await mongoose.connect(MONGO_URI);

    let mining_details = await UserMiningDetail.findOne({ user: userId });
    if (!mining_details) {
      return res.status(404).json({ success: false, message: "Mining details not found.", daily_reward_claimed: false });
    }

    const { hashpower, purchased_hashpower, offset, local_start_time } = mining_details;
    const claimed_hashpower = hashpower || 0;
    const purchased_hp = purchased_hashpower || 0;
    const total_hashpower = claimed_hashpower + purchased_hp;
    const userOffsetMin = Number(offset) || 0;

    console.log("UserID:", userId);
    console.log("Claimed Hashpower:", claimed_hashpower);
    console.log("Purchased Hashpower:", purchased_hp);
    console.log("Total Hashpower:", total_hashpower);
    console.log("LocalStartTime:", local_start_time);
    console.log("Current Local Time:", local_time);

    if (!total_hashpower || total_hashpower <= 0 || !local_start_time) {
      return res.json({
        success: true,
        mining_details,
        calculated_btc: 0,
        time_remaining: 0,
        message: "Mining not active or invalid hashpower.",
        daily_reward_claimed: false
      });
    }

    // Parse DB local_start_time
    const dbParts = local_start_time.match(/\d+/g); // [month, day, year, hour, min, sec]
    const dbAmPm = /AM|PM/i.exec(local_start_time)?.[0]?.toUpperCase();
    let dbHour = parseInt(dbParts[3], 10);
    if (dbAmPm === "PM" && dbHour < 12) dbHour += 12;
    if (dbAmPm === "AM" && dbHour === 12) dbHour = 0;

    const startday = parseInt(dbParts[0], 10);
    const startmonth = parseInt(dbParts[1], 10) - 1;
    const startyear = parseInt(dbParts[2], 10);

    const dbLocalStart = new Date(startyear, startmonth, startday, dbHour, parseInt(dbParts[4]), parseInt(dbParts[5]));

    // Parse client local_time
    const clientParts = local_time.match(/\d+/g);
    const clientAmPm = /AM|PM/i.exec(local_time)?.[0]?.toUpperCase();
    let clientHour = parseInt(clientParts[3], 10);
    if (clientAmPm === "PM" && clientHour < 12) clientHour += 12;
    if (clientAmPm === "AM" && clientHour === 12) clientHour = 0;

    const day = parseInt(clientParts[0], 10);
    const month = parseInt(clientParts[1], 10) - 1;
    const year = parseInt(clientParts[2], 10);

    const clientLocalTime = new Date(year, month, day, clientHour, parseInt(clientParts[4]), parseInt(clientParts[5]));

    // Compute elapsed time
    let elapsedMs = Math.max(0, clientLocalTime.getTime() - dbLocalStart.getTime());
    const elapsedSec = elapsedMs / 1000;
    console.log("Elapsed seconds:", elapsedSec);

    const sameDay = isSameLocalDay(dbLocalStart, clientLocalTime);

    let calculated_btc = 0;

    const yesterdayLocall = new Date(clientLocalTime.getFullYear(), clientLocalTime.getMonth(), clientLocalTime.getDate() - 1);

    console.log("DB Local Time: ", dbLocalStart);
    console.log("Client Local Time: ", clientLocalTime);
    console.log("Client Local Yesterday: ", yesterdayLocall);

    if (sameDay) {
      const miningDurationSec = Math.min(elapsedSec, MAX_MINING_DURATION_MS / 1000);
      calculated_btc = total_hashpower * BTC_PER_HASHPOWER_PER_SEC * miningDurationSec;
      console.log("Total Mined BTC:", calculated_btc);
    } else {
      // Exceeded mining duration → reset mining
      const btcToTransfer = total_hashpower * BTC_PER_HASHPOWER_PER_SEC * 24 * 3600;

      const miningDurationSec = Math.min(elapsedSec, MAX_MINING_DURATION_MS / 1000);
      calculated_btc = total_hashpower * BTC_PER_HASHPOWER_PER_SEC * miningDurationSec;

      console.log("UserID:", userId);
      console.log("Mining Details:", mining_details);

      const user_balance = await Balance.findOne({ user: userId });
      if (user_balance) {
        user_balance.BTC_DEPOSIT = parseFloat(user_balance.BTC_DEPOSIT?.toString() || "0") + btcToTransfer;
        user_balance.BTC = 0;
        await user_balance.save();
      }

      const yesterdayLocal = new Date(clientLocalTime.getFullYear(), clientLocalTime.getMonth(), clientLocalTime.getDate() - 1);

      await BalanceHistory.findOneAndUpdate(
        { user: userId, date: yesterdayLocal },
        {
          $set: {
            user: userId,
            date: yesterdayLocal,
            balances: {
              BTC: btcToTransfer,
              BNB: user_balance?.BNB ?? 0,
              USDT: user_balance?.USDT ?? 0,
              USDC: user_balance?.USDC ?? 0,
              LTC: user_balance?.LTC ?? 0,
            },
          },
        },
        { upsert: true, new: true }
      );

      await DailyRewardClaim.deleteMany({ userId });

      await DailyFreeMiner.deleteMany({ userId });

      // Reset only claimed hashpower at midnight, preserve purchased hashpower
      await UserMiningDetail.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            hashpower: 0,  // Reset claimed hashpower from ads/rewards
            // purchased_hashpower remains unchanged - persists across midnight
            mining_isactive: false,
            rewarded_ads_watched: 0,
            thirty_gh_rewarded_ads_watched: 0,
            random_ads_watched: 0,
            start_time: 0,
            stop_time: 0,
            local_start_time: null,
            local_stop_time: null,
          },
        }
      );

      calculated_btc = 0;
      mining_details = await UserMiningDetail.findOne({ user: userId });
    }

    const nextLocalMidnight = new Date(clientLocalTime.getFullYear(), clientLocalTime.getMonth(), clientLocalTime.getDate() + 1);
    const time_remaining_secs = Math.max(0, Math.floor((nextLocalMidnight - clientLocalTime) / 1000));

    console.log("Remaining Time: ", time_remaining_secs);
    console.log(`Time remaining: ${(time_remaining_secs / 60).toFixed(2)} mins (${(time_remaining_secs / 3600).toFixed(2)} hrs)`);


    var DailyRewardClaimed = false;

    const existingClaim = await DailyFreeMiner.findOne({
      userId
    });

    if (existingClaim) {
      DailyRewardClaimed = true;
    }

    // Fetch user's balance to get BTC_DEPOSIT (previous days' earnings)
    const user_balance = await Balance.findOne({ user: userId });
    const btc_deposit = user_balance?.BTC_DEPOSIT ? parseFloat(user_balance.BTC_DEPOSIT.toString()) : 0;

    // Calculate total BTC = today's calculated BTC + all previous days' earnings
    const total_btc = parseFloat(calculated_btc.toFixed(16)) + btc_deposit;

    return res.json({
      success: true,
      mining_details,
      calculated_btc: parseFloat(calculated_btc.toFixed(16)),
      btc_deposit: parseFloat(btc_deposit.toFixed(16)),
      total_btc: parseFloat(total_btc.toFixed(16)),
      claimed_hashpower: claimed_hashpower,
      purchased_hashpower: purchased_hp,
      total_hashpower: total_hashpower,
      message: "Mining details fetched successfully (local time based).",
      time_remaining: time_remaining_secs ?? 0,
      daily_reward_claimed: DailyRewardClaimed
    });
  } catch (err) {
    console.error("Error fetching mining details:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
      time_remaining: 0,
      daily_reward_claimed: false
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
      thirty_gh_rewarded_ads_watched,
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

    // CRITICAL: Handle hashpower updates correctly to preserve purchased_hashpower
    if (typeof hashpower === "number") {
      // Frontend sends total hashpower (claimed + purchased)
      // We need to extract only the claimed portion
      const current_purchased = existingRecord?.purchased_hashpower || 0;
      const current_claimed = existingRecord?.hashpower || 0;
      const current_total = current_claimed + current_purchased;

      // Calculate the delta (how much was added)
      const delta = hashpower - current_total;

      // Add delta to claimed hashpower only
      const new_claimed = Math.max(0, current_claimed + delta);

      console.log(`Hashpower update: total sent=${hashpower}, current_total=${current_total}, delta=${delta}`);
      console.log(`Claimed: ${current_claimed} -> ${new_claimed}, Purchased: ${current_purchased} (unchanged)`);

      updateData.hashpower = new_claimed;
    }
    if (typeof rewarded_ads_watched === "number") updateData.rewarded_ads_watched = rewarded_ads_watched;
    if (typeof thirty_gh_rewarded_ads_watched === "number") updateData.thirty_gh_rewarded_ads_watched = thirty_gh_rewarded_ads_watched;
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
