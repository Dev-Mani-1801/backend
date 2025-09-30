import cron from "node-cron";
import Balance from "./models/Balance.js";
import BalanceHistory from "./models/BalanceHistory.js";

import DailyRewardClaim from "./models/DailyRewardClaim.js";
import DailyRewardClaimHistory from "./models/DailyRewardClaimHistory.js";

// Run at midnight server time: "0 0 * * *"
cron.schedule("0 0 * * *", async () => {
  console.log("Running daily balance snapshot job...");

  try {
    const allBalances = await Balance.find({});
    const today = new Date().setHours(0, 0, 0, 0);

    for (const bal of allBalances) {
      
      const btcToTransfer = bal.BTC ? parseFloat(bal.BTC.toString()) : 0;

      if (btcToTransfer > 0) {
        // Transfer BTC into BTC_DEPOSIT
        bal.BTC_DEPOSIT = parseFloat(bal.BTC_DEPOSIT.toString()) + btcToTransfer;
        bal.BTC = 0;
        await bal.save();
      }

      await BalanceHistory.findOneAndUpdate(
        { user: bal.user, date: today },
        {
          user: bal.user,
          date: today,
          balances: {
            BNB: bal.BNB,
            USDT: bal.USDT,
            USDC: bal.USDC,
            BTC: bal.BTC,
            LTC: bal.LTC,
          },
        },
        { upsert: true }
      );
    }

    // --- TRANSFER DAILY REWARD CLAIMS ---
    const allClaimedRewards = await DailyRewardClaim.find({});

    if (allClaimedRewards.length > 0) {
      const historyEntries = allClaimedRewards.map((claim) => ({
        userId: claim.userId,
        rewardId: claim.rewardId,
        claimedAt: claim.claimedAt,
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt,
      }));

      await DailyRewardClaimHistory.insertMany(historyEntries);

      await DailyRewardClaim.deleteMany({});
    }
    
    console.log("Daily snapshots saved.");
  } catch (err) {
    console.error("Error saving daily snapshots:", err);
  }
});
