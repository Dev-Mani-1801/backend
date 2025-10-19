import cron from "node-cron";
import mongoose from "mongoose";
import Balance from "./models/Balance.js";
import BalanceHistory from "./models/BalanceHistory.js";
import DailyRewardClaim from "./models/DailyRewardClaim.js";
import DailyRewardClaimHistory from "./models/DailyRewardClaimHistory.js";
import UserMiningDetail from "./models/UserMiningDetails.js";

console.log("Cron Job Started!!");

const MONGO_URI = "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

const BTC_PER_HASHPOWER_PER_SEC = 0.000000000001;
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;

// Run at midnight server time: "0 0 * * *"
cron.schedule("0 0 * * *", async () => {
  console.log("Running daily balance snapshot job...");
  console.log("Nothing Here Anymore!!");

});
