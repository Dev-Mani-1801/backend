import express from 'express';
import mongoose from 'mongoose';
import UserMiningDetail from "../../models/UserMiningDetails.js";
import DailyFreeMiner from "../../models/DailyMiner.js";

const router = express.Router();

const MONGO_URI =
  "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

// POST endpoint to claim daily mining reward
router.post("/", async (req, res) => {
  try {
    const { userId, local_time } = req.body;
    if (!userId || !local_time) {
      return res.status(400).json({ success: false, message: "Missing userId or local_time." });
    }

    await mongoose.connect(MONGO_URI);

    // Fetch user's mining details
    const miningDetails = await UserMiningDetail.findOne({ user: userId });
    if (!miningDetails || !miningDetails.mining_isactive) {
      return res.json({
        success: false,
        message: "Please activate mining before claiming reward",
        time_remaining: 0
      });
    }

    // Check if user already claimed today
    const dbParts = local_time.match(/\d+/g); // parse MM/DD/YYYY, hh:mm:ss AM/PM
    const ampm = /AM|PM/i.exec(local_time)?.[0]?.toUpperCase();
    let hour = parseInt(dbParts[3], 10);
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const clientLocalTime = new Date(dbParts[2], dbParts[0] - 1, dbParts[1], hour, parseInt(dbParts[4]), parseInt(dbParts[5]));

    const todayLocal = new Date(clientLocalTime.getFullYear(), clientLocalTime.getMonth(), clientLocalTime.getDate());

    const existingClaim = await DailyFreeMiner.findOne({
      userId
    });

    const nextLocalMidnight = new Date(clientLocalTime.getFullYear(), clientLocalTime.getMonth(), clientLocalTime.getDate() + 1);
    const time_remaining_secs = Math.max(0, Math.floor((nextLocalMidnight - clientLocalTime) / 1000));

    console.log("User Claimed DailyReward ?: ", existingClaim);
    console.log("Total Time Remaining: ", time_remaining_secs);

    if (existingClaim) {
        console.log("User Already Claimed Daily Reward", "UserID: ", userId);
      return res.json({
        success: true,
        message: "Reward already claimed",
        time_remaining: time_remaining_secs
      });
    }

    // Create new claim
    const claim = new DailyFreeMiner({ userId, claimedAt: clientLocalTime });
    await claim.save();

    console.log("Reward claimed successfully", "UserID: ", userId);

    return res.json({
      success: true,
      message: "Reward claimed successfully",
      time_remaining: time_remaining_secs
    });

  } catch (err) {
    console.error("Error claiming daily reward:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
      time_remaining: 0
    });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing userId." });
    }

    await mongoose.connect(MONGO_URI);

    const existingClaim = await DailyFreeMiner.findOne({ userId });

    if (existingClaim) {
      return res.json({
        success: true,
        message: "Daily free miner claimed"
      });
    } else {
      return res.json({
        success: false,
        message: "Please claim the free miner first from HomeScreen"
      });
    }

  } catch (err) {
    console.error("Error checking daily free miner:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
});

export default router;