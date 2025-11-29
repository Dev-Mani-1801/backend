// models/SubscriptionPlan.js
import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  name: { type: String },
  hashrate: { type: Number },
  unit: { type: String },
  duration: { type: Number },
  maintenance_cost: { type: Number },
  plan_cost: { type: Number },
  apple_identifier: { type: String },
  google_identifier: { type: String }
});

const SubscriptionPlan = mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
export default SubscriptionPlan;
