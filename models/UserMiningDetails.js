import mongoose from "mongoose";

const UserMiningSchema = new mongoose.Schema({
  user: {
    type: String,
    ref: 'users',
    required: true,
    unique: true
  },
  firebase_uid: {
    type: String,
    ref: 'users',
    index: true
  },
  hashpower: {
    type: Number,
    required: true,
    min: 0
  },
  claimedHashpower: {
    type: Number,
    required: false,
    default: 0,
    min: 0
  },
  purchasedHashpower: {
    type: Number,
    required: false,
    default: 0,
    min: 0
  },
  rewarded_ads_watched: {
    type: Number,
    required: true,
    min: 0
  },
  thirty_gh_rewarded_ads_watched: {
    type: Number,
    required: false,
    min: 0
  },
  random_ads_watched: {
    type: Number,
    required: true,
    min: 0
  },
  mining_isactive: {
    type: Boolean,
    default: false
  },
  start_time: {
    type: Number,
    default: null
  },
  stop_time: {
    type: Number,
    default: null
  },
  local_start_time: {
    type: String,
    default: null,
  },
  local_stop_time: {
    type: String,
    default: null,
  },
  offset: {
    type: Number,
    default: null
  },
  dailyVideoRequirement: {
    videosWatched: {
      type: Number,
      default: 0
    },
    required: {
      type: Number,
      default: 10 // Default requirement: 5 videos per day
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    consecutiveFailures: {
      type: Number,
      default: 0
    }
  },
  // NEW: Loss Tracking
  lossTracking: {
    daily_ads_watched: {
      type: Number,
      default: 0
    },
    cumulative_loss: {
      type: Number,
      default: 0
    },
    daily_loss_offset: {
      type: Number,
      default: 3.0  // 3% daily loss if ads not watched
    },
    daily_ads_required: {
      type: Number,
      default: 10   // Must watch 30 ads per day
    },
    last_check_date: {
      type: Date,
      default: Date.now
    }
  },
  lastResetTime: {
    type: Date,
    default: null  // Tracks when the daily reset cron last ran for this user
  }
}, { timestamps: true });

// Method to reset daily video counter
UserMiningSchema.methods.resetDailyVideoCounter = function() {
  this.dailyVideoRequirement.videosWatched = 0;
  this.dailyVideoRequirement.lastResetDate = new Date();
  this.lossTracking.daily_ads_watched = 0; // Reset daily ads too
};

// Method to increment daily video count
UserMiningSchema.methods.incrementDailyVideoCount = function() {
  this.dailyVideoRequirement.videosWatched += 1;
};

// Method to check if daily requirement is met
UserMiningSchema.methods.metDailyRequirement = function() {
  return this.dailyVideoRequirement.videosWatched >= this.dailyVideoRequirement.required;
};

// Method to get daily progress
UserMiningSchema.methods.getDailyProgress = function() {
  return {
    videosWatched: this.dailyVideoRequirement.videosWatched,
    required: this.dailyVideoRequirement.required,
    met: this.metDailyRequirement(),
    consecutiveFailures: this.dailyVideoRequirement.consecutiveFailures,
    lastResetDate: this.dailyVideoRequirement.lastResetDate
  };
};

// Method to increment loss offset ads
UserMiningSchema.methods.incrementLossOffsetAds = function() {
  this.lossTracking.daily_ads_watched += 1;
};
// Method to reduce cumulative loss when daily ad requirement is met
UserMiningSchema.methods.reduceCumulativeLoss = function() {
  const adsRequired = this.lossTracking.daily_ads_required || 10;
  const adsWatched = this.lossTracking.daily_ads_watched || 0;
  
  if (adsWatched >= adsRequired && this.lossTracking.cumulative_loss > 0) {
    const dailyOffset = this.lossTracking.daily_loss_offset || 3.0;
    this.lossTracking.cumulative_loss = Math.max(0, this.lossTracking.cumulative_loss - dailyOffset);
    console.log(`Reduced cumulative loss by ${dailyOffset}%. New total: ${this.lossTracking.cumulative_loss}%`);
    return true;
  }
  return false;
};

// Method to check and apply daily loss
UserMiningSchema.methods.checkAndApplyDailyLoss = function() {
  const now = new Date();
  const lastCheck = new Date(this.lossTracking.last_check_date || now);

  // Calculate number of days passed
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysPassed = Math.floor((now - lastCheck) / msPerDay);

  if (daysPassed > 0) {
    const adsRequired = this.lossTracking.daily_ads_required || 10;
    const adsWatched = this.lossTracking.daily_ads_watched || 0;

    if (adsWatched < adsRequired) {
      // Apply daily loss for EACH day that passed - accumulates (3%, 6%, 9%, etc.)
      const dailyLoss = this.lossTracking.daily_loss_offset || 3.0;
      const totalLoss = dailyLoss * daysPassed;
      this.lossTracking.cumulative_loss += totalLoss;
      console.log(`Applied ${dailyLoss}% loss for ${daysPassed} day(s). Total loss added: ${totalLoss}%. New cumulative: ${this.lossTracking.cumulative_loss}%`);
    } else {
      // User completed target - reset cumulative loss to 0
      this.lossTracking.cumulative_loss = 0;
      console.log(`User met requirement (${adsWatched}/${adsRequired}). Cumulative loss reset to 0%.`);
    }
    // Reset counter for new day
    this.lossTracking.daily_ads_watched = 0;
    this.lossTracking.last_check_date = now;
  }
};

// Method to get effective hashpower after loss
// DISABLED: Cumulative loss is no longer active, return full hashpower
UserMiningSchema.methods.getEffectiveHashpower = function() {
  const totalHashpower = this.hashpower || 0;
  // Apply cumulative loss (e.g., 3% loss per cumulative_loss)
  const lossPercentage = this.lossTracking.cumulative_loss || 0;
  const effectiveHashpower = totalHashpower * (1 - lossPercentage / 100);
  return Math.max(0, effectiveHashpower); // Never go below zero
};

export default mongoose.model("UserMining", UserMiningSchema);