import cron from "node-cron";
import mongoose from "mongoose";
import Balance from "./models/Balance.js";
import BalanceHistory from "./models/BalanceHistory.js";
import DailyRewardClaim from "./models/DailyRewardClaim.js";
import DailyRewardClaimHistory from "./models/DailyRewardClaimHistory.js";
import UserMiningDetail from "./models/UserMiningDetails.js";
import DailyFreeMiner from "./models/DailyMiner.js";

console.log("Cron Job Started!!");

const MONGO_URI = "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

const BTC_PER_HASHPOWER_PER_SEC = 0.000000000001;
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;

// Run at midnight server time: "0 0 * * *"
cron.schedule("0 0 * * *", async () => {
  console.log("Running daily mining power reset job at midnight...");

  try {
    await mongoose.connect(MONGO_URI);

    // Get all active mining users
    const allMiningDetails = await UserMiningDetail.find({ mining_isactive: true });

    console.log(`Found ${allMiningDetails.length} active mining users to reset`);

    for (const miningDetail of allMiningDetails) {
      try {
        const userId = miningDetail.user;

        // Use existing purchasedHashpower from database (set by purchase flow)
        const purchasedHashpower = miningDetail.purchasedHashpower || 0;

        // Reset only claimed hashpower, keep purchased
        await UserMiningDetail.findOneAndUpdate(
          { user: userId },
          {
            $set: {
              claimedHashpower: 0, // Reset daily claimed power
              hashpower: purchasedHashpower, // Total = purchased only (claimed reset to 0)
              mining_isactive: false,
              rewarded_ads_watched: 0,
              thirty_gh_rewarded_ads_watched: 0,
              random_ads_watched: 0,
            },
          }
        );

        // Delete daily reward claims so users can claim again
        await DailyFreeMiner.deleteMany({ userId });

        console.log(`Reset user ${userId}: claimed=0, purchased=${purchasedHashpower}, total=${purchasedHashpower}`);

      } catch (userErr) {
        console.error(`Error resetting user ${miningDetail.user}:`, userErr);
      }
    }

    console.log("Daily mining power reset completed successfully");

  } catch (err) {
    console.error("Error in daily mining power reset cron job:", err);
  }
});
