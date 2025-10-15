import express from 'express';
import mongoose from 'mongoose';
import UserMiningDetail from "../../models/UserMiningDetails.js";
import BalanceHistory from "../../models/BalanceHistory.js";

const router = express.Router();

const BTC_PER_HASHPOWER_PER_SEC = 0.000000000001;
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;

// GET user mining details by userId
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Get mining details
    const mining_details = await UserMiningDetail.findOne({ user: userId });
    if (!mining_details) {
      return res.status(404).json({ success: false, message: "Mining details not found." });
    }

    const { start_time, hashpower, updatedAt } = mining_details;

    console.log("User Mining - Details: ", mining_details);

    // Safety check
    if (!start_time || !hashpower || hashpower <= 0) {
      return res.json({
        success: true,
        mining_details,
        calculated_btc: 0,
        message: "Mining not active or invalid hashpower.",
      });
    }

    // Calculate time difference (since last update)
    const now = Date.now();
    const lastUpdateTime = new Date(updatedAt).getTime();
    const elapsed = now - start_time;
    const sinceLastUpdate = now - lastUpdateTime;

    console.log("User Mining - Elapsed: ", elapsed);

    let calculated_btc = 0;

    // If within 24 hours → calculate earnings from balance history
    if (sinceLastUpdate < MAX_MINING_DURATION_MS) {
      // Find yesterday's balance
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0));
      const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999));

      const balanceHistory = await BalanceHistory.findOne({
        user: userId,
        date: { $gte: startOfYesterday, $lte: endOfYesterday },
      });

      const yesterdayBTC = balanceHistory?.balances?.BTC
        ? parseFloat(balanceHistory.balances.BTC.toString())
        : 0;

      // How long has mining been active since start time
      const miningDurationSec = Math.min(elapsed / 1000, MAX_MINING_DURATION_MS / 1000);

      console.log("User Mining - Yesterday's Balance: ", yesterdayBTC);
      console.log("User Mining - Total Mining Duration: ", miningDurationSec);

      // Calculate earned BTC based on hashpower and duration
      calculated_btc = ((hashpower * BTC_PER_HASHPOWER_PER_SEC) * miningDurationSec);
    }

    console.log("Calculated BTC: ", calculated_btc);

    // Return combined response
    res.json({
      success: true,
      mining_details,
      calculated_btc,
    });
  } catch (err) {
    console.error("Error fetching mining details:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create or update user mining details
router.post("/", async (req, res) => {
  try {
    const { user_id, hashpower, mining_isactive, rewarded_ads_watched, random_ads_watched, start_time, stop_time } = req.body;

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

    if (typeof start_time === "number") {
      if (!existingRecord || !existingRecord.start_time) {
        // No record found → set start_time
        updateData.start_time = start_time;
      } else {
        const lastStart = new Date(existingRecord.start_time).getTime();
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

    res.json({ success: true, mining_details });
  } catch (err) {
    console.error("Error saving mining details:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
