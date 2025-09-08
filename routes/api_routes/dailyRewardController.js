import express from "express";
import DailyReward from "../../models/DailyReward.js";
import DailyRewardClaim from "../../models/DailyRewardClaim.js";

const router = express.Router();

// Fetch all rewards (with claimed flag for the user)
router.get("/", async (req, res) => {
  try {
    const { userId } = req.query;

    const rewards = await DailyReward.find();

    let claims = [];
    if (userId) {
      claims = await DailyRewardClaim.find({ userId });
    }

    // build claimed set
    const claimedSet = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    claims.forEach(claim => {
      if (claim.claimedAt >= today) {
        claimedSet.add(claim.rewardId.toString()); // recurring → claimed today
      } else {
        claimedSet.add(claim.rewardId.toString()); // non-recurring → claimed once ever
      }
    });

    const rewardsWithClaimStatus = rewards.map(r => {
      const isClaimed = claimedSet.has(r._id.toString());
      return {
        ...r.toObject(),
        claimed: isClaimed,
      };
    });

    res.json({ success: true, rewards: rewardsWithClaimStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Admin: Create reward
router.post("/create", async (req, res) => {
  try {
    const { day, isRecurring, rewardType, amount } = req.body;

    const reward = new DailyReward({ day, isRecurring, rewardType, amount });
    await reward.save();

    res.json({ success: true, reward });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// User: Claim reward
router.post("/claim", async (req, res) => {
  try {
    const { userId, rewardId } = req.body;

    if (!userId || !rewardId) {
      return res.status(400).json({ success: false, error: "userId and rewardId are required" });
    }

    const reward = await DailyReward.findById(rewardId);
    if (!reward) {
      return res.status(404).json({ success: false, error: "Reward not found" });
    }

    if (reward.isRecurring) {
      // Once per calendar day
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const alreadyClaimed = await DailyRewardClaim.findOne({
        userId,
        rewardId: reward._id,
        claimedAt: { $gte: today },
      });

      if (alreadyClaimed) {
        return res.status(400).json({ success: false, error: "Already claimed today" });
      }
    } else {
      // Day-based → only once
      const existingClaim = await DailyRewardClaim.findOne({ userId, rewardId: reward._id });
      if (existingClaim) {
        return res.status(400).json({ success: false, error: "Already claimed" });
      }
    }

    const claim = new DailyRewardClaim({ userId, rewardId });
    await claim.save();

    res.json({ success: true, reward });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

export default router;
