/**
 * Push Notification Service
 */

import { getMessaging } from '../config/firebase.js';
import FirebaseNotifications from '../models/FirebaseNotificationModels.js';
import NotificationPreferences from '../models/NotificationPreferences.js';

/**
 * Send push notification to a single user
 *
 * @param {string} userId - User ID
 * @param {object} notification - Notification data {title, body, data}
 * @returns {Promise<object>} - Result with success status
 *
 */
export const sendNotificationToUser = async (userId, notification) => {
  try {
    const messaging = getMessaging();

    if (!messaging) {
      console.warn('Firebase Messaging not initialized. Skipping notification.');
      return { success: false, reason: 'Firebase not configured' };
    }

    // Check if user has push notifications enabled
    // Default behavior: If no preference exists, allow notifications (opt-out model)
    // Only block if preference explicitly exists and is set to false
    const preferences = await NotificationPreferences.findOne({ user: userId });

    if (preferences && preferences.push === false) {
      console.log(`Push notifications disabled for user ${userId}`);
      return { success: false, reason: 'User has disabled push notifications' };
    }

    // Get user's FCM token
    const userToken = await FirebaseNotifications.findOne({ user_id: userId });

    if (!userToken || !userToken.token) {
      console.log(`No FCM token found for user ${userId}`);
      return { success: false, reason: 'No FCM token found' };
    }

    // Prepare FCM message
    // Firebase automatically detects platform from token
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      token: userToken.token,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    // Send notification
    const response = await messaging.send(message);

    console.log(`✅ Notification sent to user ${userId}:`, response);
    return { success: true, response };

  } catch (error) {
    console.error(`❌ Error sending notification to user ${userId}:`, error.message);
    console.error(`   Error code: ${error.code || 'N/A'}`);
    console.error(`   Full error:`, error);

    // Handle invalid token error (user uninstalled app or token expired)
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      // Remove invalid token from database
      await FirebaseNotifications.deleteOne({ user_id: userId });
      console.log(`Removed invalid FCM token for user ${userId}`);
    }

    // Handle APNS auth errors
    if (error.code === 'messaging/authentication-error' || 
        error.code === 'messaging/third-party-auth-error' ||
        error.message?.includes('Auth error from APNS')) {
      console.error(`   ⚠️  APNS Authentication Error - Possible causes:`);
      console.error(`      1. iOS Simulator doesn't support push notifications (use real device)`);
      console.error(`      2. APNS key mismatch in Firebase Console`);
      console.error(`      3. App bundle ID doesn't match Firebase configuration`);
      console.error(`      4. Token is from development but sending to production (or vice versa)`);
      console.error(`      5. Service account might need additional permissions`);
    }

    return { success: false, error: error.message, code: error.code };
  }
};

/**
 * Send mining expiry notification
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Result
 */
export const sendMiningExpiryNotification = async (userId) => {
  return sendNotificationToUser(userId, {
    title: '⏰ Mining Timer Expired!',
    body: 'Your mining session has ended. Watch videos to boost your hashpower and resume mining!',
    data: {
      type: 'mining_expired',
      action: 'open_home',
    },
  });
};

/**
 * Send video reminder notification
 * @param {string} userId - User ID
 * @param {number} adsWatched - Current ads watched count
 * @param {number} maxAds - Maximum ads allowed
 * @returns {Promise<object>} - Result
 */
export const sendVideoReminderNotification = async (userId, adsWatched, maxAds) => {
  const remainingAds = maxAds - adsWatched;

  return sendNotificationToUser(userId, {
    title: '🎥 Boost Your Mining Power!',
    body: `You have ${remainingAds} video${remainingAds > 1 ? 's' : ''} left to watch. Increase your hashpower now!`,
    data: {
      type: 'video_reminder',
      action: 'open_home',
      remaining_ads: remainingAds.toString(),
    },
  });
};

/**
 * Send clock reset notification
 *
 * @param {string} userId - User ID
 * @param {number} hoursRemaining - Hours remaining before expiry (optional - for midnight reset)
 * @returns {Promise<object>} - Result
 */
export const sendClockResetNotification = async (userId, hoursRemaining = null) => {
  // If hoursRemaining is null, it's a midnight reset notification
  const isMidnightReset = hoursRemaining === null;
  
  return sendNotificationToUser(userId, {
    title: isMidnightReset ? '🌙 Daily Mining Reset!' : '⚡ Time Running Out!',
    body: isMidnightReset 
      ? 'Your 24-hour mining cycle has reset. Watch videos to boost your hashpower and start earning again!'
      : `Only ${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''} left on your mining timer. Watch videos to extend your mining session!`,
    data: {
      type: isMidnightReset ? 'midnight_reset' : 'clock_reset',
      action: 'open_home',
      hours_remaining: hoursRemaining?.toString() || '0',
    },
  });
};

/**
 * Send daily reward reminder
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Result
 */
export const sendDailyRewardReminder = async (userId) => {
  return sendNotificationToUser(userId, {
    title: '🎁 Daily Reward Available!',
    body: 'Claim your free daily mining reward now! Don\'t miss out on bonus hashpower.',
    data: {
      type: 'daily_reward',
      action: 'open_rewards',
    },
  });
};

/**
 * Send mining stopped notification
 * This is sent when user's mining is reset/stopped by the cron job
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Result
 */
export const sendMiningStoppedNotification = async (userId) => {
  return sendNotificationToUser(userId, {
    title: '⛏️ Mining Stopped',
    body: 'User mining stopped please start mining',
    data: {
      type: 'mining_stopped',
      action: 'open_home',
    },
  });
};

/**
 * Send custom notification
 *
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data
 * @returns {Promise<object>} - Result
 */
export const sendCustomNotification = async (userId, title, body, data = {}) => {
  return sendNotificationToUser(userId, {
    title,
    body,
    data: {
      type: 'custom',
      ...data,
    },
  });
};

/**
 * Send notification to multiple users
 *
 * @param {Array<string>} userIds - Array of user IDs
 * @param {object} notification - Notification data
 * @returns {Promise<object>} - Results summary
 */
export const sendBulkNotifications = async (userIds, notification) => {
  const results = {
    total: userIds.length,
    sent: 0,
    failed: 0,
    disabled: 0,
    noToken: 0,
  };

  const promises = userIds.map(async (userId) => {
    const result = await sendNotificationToUser(userId, notification);

    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      if (result.reason === 'User has disabled push notifications') {
        results.disabled++;
      } else if (result.reason === 'No FCM token found') {
        results.noToken++;
      }
    }
  });

  await Promise.allSettled(promises);

  console.log('📊 Bulk notification results:', results);
  return results;
};

export default {
  sendNotificationToUser,
  sendMiningExpiryNotification,
  sendVideoReminderNotification,
  sendClockResetNotification,
  sendDailyRewardReminder,
  sendMiningStoppedNotification,
  sendCustomNotification,
  sendBulkNotifications,
};
