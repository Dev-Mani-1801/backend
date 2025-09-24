import mongoose from "mongoose";

const NotificationPreferencesSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  email: {
    type: Boolean,
    default: false,
  },
  push: {
    type: Boolean,
    default: false,
  },
  sms: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

export default mongoose.model("NotificationPreferences", NotificationPreferencesSchema);
