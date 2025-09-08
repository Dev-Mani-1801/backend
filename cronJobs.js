import cron from "node-cron";
import Balance from "./models/Balance.js";
import BalanceHistory from "./models/BalanceHistory.js";

// Run at midnight server time: "0 0 * * *"
cron.schedule("0 0 * * *", async () => {
  console.log("Running daily balance snapshot job...");

  try {
    const allBalances = await Balance.find({});
    const today = new Date().setHours(0, 0, 0, 0);

    for (const bal of allBalances) {
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

    console.log("Daily snapshots saved.");
  } catch (err) {
    console.error("Error saving daily snapshots:", err);
  }
});
