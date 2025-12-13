import cron from "node-cron";
import mongoose from "mongoose";
import Balance from "./models/Balance.js";
import BalanceHistory from "./models/BalanceHistory.js";
import DailyRewardClaim from "./models/DailyRewardClaim.js";
import DailyRewardClaimHistory from "./models/DailyRewardClaimHistory.js";
import UserMiningDetail from "./models/UserMiningDetails.js";
import DailyFreeMiner from "./models/DailyMiner.js";
import MiningSession from "./models/MiningSession.js";
import {
  sendMiningExpiryNotification,
  sendClockResetNotification,
  sendVideoReminderNotification,
  sendDailyRewardReminder,
  sendMiningStoppedNotification,
} from "./services/notificationService.js";
import { initializeFirebase } from "./config/firebase.js";

console.log("Cron Job Started!!");

// Initialize Firebase Admin SDK for push notifications
initializeFirebase();

const MONGO_URI = "mongodb+srv://growthdev1:Ji0LlqjCuFzlYP9s@cluster0.zgxt7d9.mongodb.net/fakeminingapp?retryWrites=true&w=majority";

const BTC_PER_HASHPOWER_PER_SEC = 0.000000000001;
const MAX_MINING_DURATION_MS = 24 * 60 * 60 * 1000;

// Run at midnight UAE time (00:00:00 UAE): "0 0 * * *" with timezone
cron.schedule("0 0 * * *", async () => {
  console.log("Running daily mining power reset job at midnight (UAE time)...");

  try {
    await mongoose.connect(MONGO_URI);

    // Get all active mining users
    const allMiningDetails = await UserMiningDetail.find({ mining_isactive: true });

    console.log(`Found ${allMiningDetails.length} active mining users to reset`);

    for (const miningDetail of allMiningDetails) {
      try {
        const userId = miningDetail.user;

        // Check if user was reset in the last 24 hours
        const now = new Date();
        const lastResetTime = miningDetail.lastResetTime;

        if (lastResetTime) {
          const hoursSinceLastReset = (now - lastResetTime) / (1000 * 60 * 60);

          if (hoursSinceLastReset < 24) {
            console.log(`Skipping user ${userId}: Last reset was ${hoursSinceLastReset.toFixed(2)} hours ago (< 24 hours)`);
            continue; // Skip this user, they were already reset recently
          }
        }

        // Use existing purchasedHashpower from database (set by purchase flow)
        const purchasedHashpower = miningDetail.purchasedHashpower || 0;

        // Reset only claimed hashpower, keep purchased, and update lastResetTime
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
              lastResetTime: now, // Track when this reset occurred
            },
          }
        );

        // Delete daily reward claims so users can claim again
        await DailyFreeMiner.deleteMany({ userId });

        // Send mining stopped notification
        try {
          await sendMiningStoppedNotification(userId);
          console.log(`✅ Sent mining stopped notification to user ${userId}`);
        } catch (notifyErr) {
          console.error(`Error sending mining stopped notification to user ${userId}:`, notifyErr);
        }

        console.log(`Reset user ${userId}: claimed=0, purchased=${purchasedHashpower}, total=${purchasedHashpower}, resetTime=${now.toISOString()}`);

      } catch (userErr) {
        console.error(`Error resetting user ${miningDetail.user}:`, userErr);
      }
    }

    console.log("Daily mining power reset completed successfully");

  } catch (err) {
    console.error("Error in daily mining power reset cron job:", err);
  }
}, {
  timezone: "Asia/Dubai"
});

// Check for expired mining sessions every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  console.log("🔔 Checking for expired mining sessions...");

  try {
    await mongoose.connect(MONGO_URI);

    // Find sessions that have expired but not notified
    const expiredSessions = await MiningSession.findExpiredNotNotified();

    console.log(`Found ${expiredSessions.length} expired sessions to notify`);

    for (const session of expiredSessions) {
      try {
        // Send expiry notification
        await sendMiningExpiryNotification(session.user_id);

        // Mark as notified
        await session.recordNotification('expired');

        console.log(`✅ Sent expiry notification to user ${session.user_id}`);
      } catch (notifyErr) {
        console.error(`Error notifying user ${session.user_id}:`, notifyErr);
      }
    }

    console.log("Expired mining session notifications completed");

  } catch (err) {
    console.error("Error in expired mining session cron job:", err);
  }
});

/**
 * Check for mining sessions expiring soon every hour
 *
 */
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Checking for mining sessions expiring soon...");

  try {
    await mongoose.connect(MONGO_URI);

    // Find sessions expiring within 1 hour
    const expiringSessions = await MiningSession.findExpiringSoon();

    console.log(`Found ${expiringSessions.length} sessions expiring soon`);

    for (const session of expiringSessions) {
      try {
        // Calculate hours remaining
        const hoursRemaining = Math.ceil(
          (session.end_time - new Date()) / (1000 * 60 * 60)
        );

        // Send warning notification
        await sendClockResetNotification(session.user_id, hoursRemaining);

        // Mark as notified
        await session.recordNotification('expiry_warning');

        console.log(`✅ Sent expiry warning to user ${session.user_id} (${hoursRemaining}h remaining)`);
      } catch (notifyErr) {
        console.error(`Error notifying user ${session.user_id}:`, notifyErr);
      }
    }

    console.log("Expiry warning notifications completed");

  } catch (err) {
    console.error("Error in expiry warning cron job:", err);
  }
});

/**
 * Send video reminders every 6 hours (4 times a day)

 */
cron.schedule("0 */6 * * *", async () => {
  console.log("🎥 Checking for video reminder opportunities...");

  try {
    await mongoose.connect(MONGO_URI);

    // Find active sessions with low video count
    const sessionsNeedingReminder = await MiningSession.findNeedingVideoReminder();

    console.log(`Found ${sessionsNeedingReminder.length} users needing video reminders`);

    for (const session of sessionsNeedingReminder) {
      try {
        const maxAds = 10; // From frontend MAX_ADS constant

        // Send video reminder
        await sendVideoReminderNotification(
          session.user_id,
          session.ads_watched,
          maxAds
        );

        // Record that reminder was sent
        await session.recordNotification('video_reminder');

        console.log(`✅ Sent video reminder to user ${session.user_id} (${session.ads_watched}/${maxAds} ads)`);
      } catch (notifyErr) {
        console.error(`Error sending video reminder to user ${session.user_id}:`, notifyErr);
      }
    }

    console.log("Video reminder notifications completed");

  } catch (err) {
    console.error("Error in video reminder cron job:", err);
  }
});

/**
 * Send daily reward reminders at 9 AM server time
 *
 */
// cron.schedule("0 9 * * *", async () => {
//   console.log("🎁 Sending daily reward reminders...");

//   try {
//     await mongoose.connect(MONGO_URI);

//     // Find users who haven't claimed daily reward yet
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const unclaimedUsers = await DailyFreeMiner.distinct('userId', {
//       createdAt: { $lt: today }
//     });

//     // Get all users with mining details
//     const allUsers = await UserMiningDetail.find({}, 'user');

//     // Filter users who haven't claimed today
//     const usersToNotify = allUsers
//       .map(u => u.user)
//       .filter(userId => !unclaimedUsers.includes(userId));

//     console.log(`Sending daily reward reminders to ${usersToNotify.length} users`);

//     // for (const userId of usersToNotify) {
//     //   try {
//     //     await sendDailyRewardReminder(userId);
//     //     console.log(`✅ Sent daily reward reminder to user ${userId}`);
//     //   } catch (notifyErr) {
//     //     console.error(`Error sending reward reminder to user ${userId}:`, notifyErr);
//     //   }
//     // }

//     console.log("Daily reward reminders completed");

//   } catch (err) {
//     console.error("Error in daily reward reminder cron job:", err);
//   }
// });
