import express from 'express';
import mongoose from 'mongoose';
import UserMiningDetail from "../../models/UserMiningDetails.js";

const router = express.Router();

// GET user mining details by userId
router.get("/:userId", async (req, res) => {
  try {
    const mining_details = await UserMiningDetail.findOne({ user: req.params.userId });
    if (!mining_details) {
      return res.status(404).json({ success: false, message: "Mining details not found." });
    }
    res.json({ success: true, mining_details });
  } catch (err) {
    console.error("Error fetching mining details:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create or update user mining details
router.post("/", async (req, res) => {
  try {
    const { user_id, hashpower, mining_isactive, rewarded_ads_watched, random_ads_watched } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    const updateData = {};
    if (typeof hashpower === "number") updateData.hashpower = hashpower;
    if (typeof rewarded_ads_watched === "number") updateData.rewarded_ads_watched = rewarded_ads_watched;
    if (typeof random_ads_watched === "number") updateData.random_ads_watched = random_ads_watched;
    if (typeof mining_isactive === "boolean") updateData.mining_isactive = mining_isactive;

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
