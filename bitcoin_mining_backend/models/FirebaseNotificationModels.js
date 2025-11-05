// models/FirebaseNotificationModels.js
import mongoose from 'mongoose';

const FirebaseNotificationsSchema = new mongoose.Schema({
  user_id: {
    type: String,
    ref: 'users',
    required: true
  },
  firebase_uid: {
    type: String,
    ref: 'users',
    index: true
  },
  token: {
    type: String,
    required: true
  },
});

const FirebaseNotifications = mongoose.models.FirebaseNotifications || mongoose.model('FirebaseNotifications', FirebaseNotificationsSchema);
export default FirebaseNotifications;
