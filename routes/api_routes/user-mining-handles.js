import express from 'express';
import mongoose from 'mongoose';
import UserMiningDetail from "../../models/UserMiningDetails.js";
import BalanceHistory from "../../models/BalanceHistory.js";
import Balance from "../../models/Balance.js";
import DailyRewardClaim from '../../models/DailyRewardClaim.js';
import DailyFreeMiner from "../../models/DailyMiner.js";
import { processReferralRewardForChild } from "../../services/referralRewardService.js";

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

  
const incrementDailyVideoCount = async (req, res) => {
  try {
    const { user } = req.body;

    let miningDetails = await UserMiningDetail.findOne({ user });

    if (!miningDetails) {
      return res.status(404).json({
        success: false,
        message: 'Mining details not found'
      });
    }

    miningDetails.incrementDailyVideoCount();

    // Reset consecutive failures if they meet requirement
    if (miningDetails.metDailyRequirement()) {
      miningDetails.dailyVideoRequirement.consecutiveFailures = 0;
    }

    await miningDetails.save();

    res.status(200).json({
      success: true,
      message: 'Video count incremented',
      daily_progress: miningDetails.getDailyProgress()
    });
  } catch (error) {
    console.error('Error incrementing video count:', error);
    res.status(500).json({
      success: false,
      message: 'Error incrementing video count',
      error: error.message
    });
  }
};

/**
 * @desc    Increment daily ads watched for loss offset
 * @route   POST /api/user_mining/increment-loss-ad
 * @access  Public
 */
const incrementLossOffsetAd = async (req, res) => {
  try {
    const { user } = req.body;

    let miningDetails = await UserMiningDetail.findOne({ user });

    if (!miningDetails) {
      return res.status(404).json({
        success: false,
        message: 'Mining details not found'
      });
    }

    // Increment ads watched
    miningDetails.incrementLossOffsetAds();
    const lossReduced = miningDetails.reduceCumulativeLoss();
    await miningDetails.save();

    res.status(200).json({
      success: true,
      message: lossReduced 
        ? `Loss offset ad count incremented. Loss reduced by ${miningDetails.lossTracking.daily_loss_offset}%!`
        : 'Loss offset ad count incremented',
      daily_ads_watched: miningDetails.lossTracking.daily_ads_watched,
      cumulative_loss: miningDetails.lossTracking.cumulative_loss,
      loss_reduced: lossReduced 
    });
  } catch (error) {
    console.error('Error incrementing loss offset ads:', error);
    res.status(500).json({
      success: false,
      message: 'Error incrementing ad count',
      error: error.message
    });
  }
};

/**
 * @desc    Get daily video progress
 * @route   GET /api/user_mining/daily-progress/:user
 * @access  Public
 */
const getDailyProgress = async (req, res) => {
  try {
    const { userId } = req.params;

    // Add database connection if needed
    await mongoose.connect(MONGO_URI);

    // Fix: Use UserMiningDetail (singular) and query by { user: userId }
    let miningDetails = await UserMiningDetail.findOne({ user: userId });

    if (!miningDetails) {
      return res.status(404).json({
        success: false,
        message: 'Mining details not found'
      });
    }


    // Get progress
    const dailyProgress = typeof miningDetails.getDailyProgress === 'function'
      ? miningDetails.getDailyProgress()
      : {
          videosWatched: miningDetails.dailyVideoRequirement?.videosWatched || 0,
          required: miningDetails.dailyVideoRequirement?.required || 5,
          met: (miningDetails.dailyVideoRequirement?.videosWatched || 0) >= 
               (miningDetails.dailyVideoRequirement?.required || 5),
          consecutiveFailures: miningDetails.dailyVideoRequirement?.consecutiveFailures || 0,
          lastResetDate: miningDetails.dailyVideoRequirement?.lastResetDate
        };

    res.status(200).json({
      success: true,
      daily_progress: dailyProgress
    });
  } catch (error) {
    console.error('Error getting daily progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving daily progress',
      error: error.message
    });
  }
};

// GET user mining details by user
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { local_time } = req.query; // client local time
    await mongoose.connect(MONGO_URI);

    let mining_details = await UserMiningDetail.findOne({ user: userId });
    if (!mining_details) {
      return res.status(404).json({ success: false, message: "Mining details not found.", daily_reward_claimed: false });
    }

    // Migration logic: if claimedHashpower and purchasedHashpower are not set, initialize them
    // Assume all existing hashpower is claimed (since we don't have historical purchase data)
    if (mining_details.claimedHashpower === undefined || mining_details.purchasedHashpower === undefined) {
      const existingHashpower = mining_details.hashpower || 0;
      const currentPurchased = mining_details.purchasedHashpower || 0;
      const currentClaimed = mining_details.claimedHashpower || 0;
      
      // Only set if undefined - don't overwrite existing values
      if (mining_details.claimedHashpower === undefined) {
        mining_details.claimedHashpower = Math.max(0, existingHashpower - currentPurchased);
      }
      if (mining_details.purchasedHashpower === undefined) {
        mining_details.purchasedHashpower = 0;
      }
      
      mining_details.hashpower = (mining_details.claimedHashpower || 0) + (mining_details.purchasedHashpower || 0);
      await mining_details.save();
      console.log(`Migrated user ${userId}: claimed=${mining_details.claimedHashpower}, purchased=${mining_details.purchasedHashpower}`);
    }

    // DISABLED: Migration logic removed - loss tracking is no longer active
    // Old migration code has been removed to prevent any loss tracking initialization

    // Validate and fix hashpower relationship: ALWAYS ensure total = claimed + purchased
    const claimed = mining_details.claimedHashpower || 0;
    const purchased = mining_details.purchasedHashpower || 0;
    const calculatedTotal = claimed + purchased;
    
    if (mining_details.hashpower !== calculatedTotal) {
      console.warn(`⚠️ Hashpower mismatch detected! DB total=${mining_details.hashpower}, should be ${calculatedTotal} (claimed=${claimed} + purchased=${purchased})`);
      mining_details.hashpower = calculatedTotal;
      await mining_details.save();
      console.log(`✅ Fixed hashpower: ${calculatedTotal}`);
    }

    // Cumulative loss tracking is no longer active
    if (mining_details.purchasedHashpower > 0) {
      if (typeof mining_details.checkAndApplyDailyLoss === 'function') {
        mining_details.checkAndApplyDailyLoss();
        await mining_details.save();
        console.log(`✅ Daily loss check completed for user ${userId}: cumulative_loss=${mining_details.lossTracking.cumulative_loss}%, daily_ads=${mining_details.lossTracking.daily_ads_watched}`);
      }
    }

// Use effective hashpower (cumulative loss applied)
let effectiveHashpower = mining_details.hashpower;
if (typeof mining_details.getEffectiveHashpower === 'function') {
  effectiveHashpower = mining_details.getEffectiveHashpower();
}


    const { hashpower, offset, local_start_time } = mining_details;
    const userOffsetMin = Number(offset) || 0;

    console.log("UserID:", userId, "Hashpower:", hashpower, "LocalStartTime:", local_start_time);
    console.log("Current Local Time:", local_time);
    

    if (!hashpower || hashpower <= 0 || !local_start_time) {
      return res.json({
        success: true,
        mining_details: {
          ...mining_details.toObject(),
          effective_hashpower: effectiveHashpower
        },
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
      calculated_btc = effectiveHashpower * BTC_PER_HASHPOWER_PER_SEC * miningDurationSec;
      console.log("Total Mined BTC:", calculated_btc);
    } else {
      // Exceeded mining duration → reset mining
      const btcToTransfer = effectiveHashpower * BTC_PER_HASHPOWER_PER_SEC * 24 * 3600;

      const miningDurationSec = Math.min(elapsedSec, MAX_MINING_DURATION_MS / 1000);
      calculated_btc = effectiveHashpower * BTC_PER_HASHPOWER_PER_SEC * miningDurationSec;

      console.log("UserID:", userId);
      console.log("Mining Details:", mining_details);

      const user_balance = await Balance.findOne({ user: userId });
      if (user_balance) {
        user_balance.BTC_DEPOSIT = parseFloat(user_balance.BTC_DEPOSIT?.toString() || "0") + calculated_btc;
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

      // Process referral reward for parent (if child has a referralUsed)
      // Process asynchronously to not block the API response
      console.log(`[Referral Rewards] 🔄 Attempting to process referral reward for child ${userId}, BTC: ${calculated_btc}, date: ${yesterdayLocal}`);
      processReferralRewardForChild(userId, calculated_btc, yesterdayLocal)
        .then((result) => {
          if (result && !result.alreadyProcessed) {
            console.log(`[Referral Rewards] ✅ Successfully processed referral reward for child ${userId}:`, result);
          } else if (result && result.alreadyProcessed) {
            console.log(`[Referral Rewards] ⏭️ Reward already processed for child ${userId}`);
          } else {
            console.log(`[Referral Rewards] ℹ️ No reward to process for child ${userId} (no parent or no mining)`);
          }
        })
        .catch((err) => {
          console.error(`[Referral Rewards] ❌ Error processing referral reward for child ${userId}:`, err);
          // Don't throw - this is non-blocking, error is logged
        });

      await DailyRewardClaim.deleteMany({ userId });

      await DailyFreeMiner.deleteMany({ userId });

      // Only reset claimed hashpower, keep purchased hashpower
      await UserMiningDetail.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            claimedHashpower: 0, // Reset daily claimed power
            hashpower: mining_details.purchasedHashpower || 0, // Keep only purchased hashpower
            mining_isactive: false,
            rewarded_ads_watched: 0,
            thirty_gh_rewarded_ads_watched: 0,
            random_ads_watched: 0,
            start_time: 0,
            stop_time: 0,
            local_start_time: null,
            local_stop_time: null,
            lastResetTime: new Date()
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

    return res.json({
      success: true,
      mining_details: {
        ...mining_details.toObject(),
        effective_hashpower: effectiveHashpower,
      },
      calculated_btc: parseFloat(calculated_btc.toFixed(16)),
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
      return res.status(400).json({ success: false, message: "user id is required" });
    }

    let existingRecord = await UserMiningDetail.findOne({ user: user_id });

    const updateData = {};

    // DISABLED: Migration logic removed - loss tracking is no longer active

    // Handle hashpower update: separate claimed from purchased
    if (typeof hashpower === "number") {
      const currentPurchased = existingRecord?.purchasedHashpower || 0;
      const currentClaimed = existingRecord?.claimedHashpower || 0;
      // Always treat incoming hashpower as the amount to add to claimed
      const claimedToAdd = hashpower;
      const newClaimed = currentClaimed + claimedToAdd;
      const totalHashpower = newClaimed + currentPurchased;

      updateData.claimedHashpower = newClaimed;
      updateData.purchasedHashpower = currentPurchased; // Keep existing purchased
      updateData.hashpower = totalHashpower; // ALWAYS: total = claimed + purchased

      console.log(`✅ POST update: total=${totalHashpower}, claimed=${newClaimed}, purchased=${currentPurchased}`);
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

    // DISABLED: Loss tracking initialization removed for new records
    // Loss tracking feature is no longer active

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

// Increment daily video count (called when user watches ad)
router.post('/increment-video', incrementDailyVideoCount);

// Increment loss offset ad count (called when user watches rewarded ad)
router.post('/increment-loss-ad', incrementLossOffsetAd);

// Get daily video progress
router.get('/daily-progress/:userId', getDailyProgress);

export default router;