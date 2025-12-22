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

// Track last cron run time for time window checking
let lastCronRunTime = new Date();

// Helper function to stop mining for a user
async function stopMiningForUser(miningDetail) {
  const userId = miningDetail.user;
  const purchasedHashpower = miningDetail.purchasedHashpower || 0;
  const now = new Date();

  try {
    // Reset mining state
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

    // Send notification (non-blocking - don't wait for it)
    sendMiningStoppedNotification(userId)
      .then(() => {
        console.log(`✅ Sent mining stopped notification to user ${userId}`);
      })
      .catch((notifyErr) => {
        console.error(`Error sending notification to user ${userId}:`, notifyErr);
      });

    console.log(`✅ Reset user ${userId} at their local midnight (offset: ${miningDetail.offset || 0})`);
  } catch (err) {
    console.error(`Error stopping mining for user ${userId}:`, err);
    throw err;
  }
}

// Run every 15 minutes - check for users at their local midnight (time window approach)
cron.schedule("*/15 * * * *", async () => {
  console.log("🕐 Checking for users at local midnight (time window check)...");

  try {
    await mongoose.connect(MONGO_URI);

    const nowUTC = new Date();
    const previousRunTime = lastCronRunTime;
    lastCronRunTime = nowUTC;

    // Get all active mining users (index on mining_isactive makes this fast)
    const activeUsers = await UserMiningDetail.find({ 
      mining_isactive: true 
    }).lean(); // Use .lean() for better performance

    console.log(`Found ${activeUsers.length} active users to check (window: ${previousRunTime.toISOString()} to ${nowUTC.toISOString()})`);

    let resetCount = 0;

    for (const miningDetail of activeUsers) {
      try {
        const userId = miningDetail.user;
        const userOffset = miningDetail.offset || 0; // minutes (negative for ahead of UTC)

        // Calculate user's midnight in UTC
        // User's local midnight = UTC time - offset
        // We need to find when user's local time was 00:00:00

        // Get today's date in user's local timezone
        const userLocalNow = new Date(
          nowUTC.getTime() - (userOffset * 60 * 1000)
        );

        // Calculate user's last midnight in their timezone
        const userMidnightLocal = new Date(
          userLocalNow.getFullYear(),
          userLocalNow.getMonth(),
          userLocalNow.getDate(),
          0, 0, 0, 0
        );

        // Convert user's midnight back to UTC
        const userMidnightUTC = new Date(
          userMidnightLocal.getTime() + (userOffset * 60 * 1000)
        );

        // Check if user's midnight occurred in the time window since last cron run
        const midnightInWindow = 
          userMidnightUTC > previousRunTime && 
          userMidnightUTC <= nowUTC;

        if (midnightInWindow) {
          console.log(`🌙 User ${userId}'s midnight occurred at ${userMidnightUTC.toISOString()} (offset: ${userOffset})`);

          // Check if we already reset this user today (prevent duplicate resets)
          const lastReset = miningDetail.lastResetTime;
          if (lastReset) {
            const hoursSinceReset = (nowUTC - lastReset) / (1000 * 60 * 60);
            if (hoursSinceReset < 23) { // Less than 23 hours ago
              console.log(`⏭️ Skipping user ${userId} - already reset ${hoursSinceReset.toFixed(1)}h ago`);
              continue;
            }
          }

          // Stop mining for this user
          await stopMiningForUser(miningDetail);
          resetCount++;
        }
      } catch (userErr) {
        console.error(`Error processing user ${miningDetail.user}:`, userErr);
      }
    }

    console.log(`✅ Midnight check completed: ${resetCount} users reset`);

  } catch (err) {
    console.error("Error in midnight check cron job:", err);
    // Reset lastCronRunTime on error to avoid missing users
    lastCronRunTime = new Date();
  }
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
