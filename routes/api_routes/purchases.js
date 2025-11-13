import express from 'express';
import mongoose from 'mongoose';
import Purchase from '../../models/Purchase.js';
import UserMiningDetail from '../../models/UserMiningDetails.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.js';

const router = express.Router();

// POST /api/purchases/:userId - Store purchase and update mining power
router.post('/:userId', async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { userId } = req.params;
    const {
      plan_id,
      product_identifier,
      revenuecat_customer_id,
      price_paid,
      currency,
      purchase_date
    } = req.body;

    // Validate required fields
    if (!userId || !plan_id || !product_identifier || !price_paid || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, plan_id, product_identifier, price_paid, currency'
      });
    }

    // Start transaction
    session.startTransaction();

    // Fetch the subscription plan details
    const plan = await SubscriptionPlan.findById(plan_id).session(session);
    
    if (!plan) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    console.log('Found plan:', plan.name, 'Hashrate:', plan.hashrate, plan.unit);

    // Get current user mining details with lock
    let userMining = await UserMiningDetail.findOne({ user: userId }).session(session);
    const existingHashPower = userMining ? userMining.hashpower : 0;

    // Calculate updated hashpower
    const updatedHashPower = existingHashPower + plan.hashrate;

    console.log(`Hashpower update: ${existingHashPower} -> ${updatedHashPower}`);

    // Create purchase record
    const purchase = new Purchase({
      user: userId,
      plan_id: plan._id,
      product_identifier,
      revenuecat_customer_id: revenuecat_customer_id || null,
      price_paid,
      currency,
      purchase_date: purchase_date || new Date(),
      status: 'completed',
      existing_hashpower: existingHashPower,
      updated_hashpower: updatedHashPower,
      mining_power_added: false
    });

    await purchase.save({ session });
    console.log('Purchase saved:', purchase._id);

    // Update user mining power
    if (!userMining) {
      // Create new mining details if not exists
      userMining = new UserMiningDetail({
        user: userId,
        hashpower: plan.hashrate,
        claimedHashpower: 0,
        purchasedHashpower: plan.hashrate, // Set purchased hashpower
        rewarded_ads_watched: 0,
        thirty_gh_rewarded_ads_watched: 0,
        random_ads_watched: 0,
        mining_isactive: false,
        start_time: null,
        stop_time: null,
        local_start_time: null,
        local_stop_time: null,
        offset: null
      });
      console.log('Created new mining details for user:', userId);
    } else {
      // Add hashrate to existing mining power
      const existingClaimed = userMining.claimedHashpower || 0;
      const existingPurchased = userMining.purchasedHashpower || 0;

      userMining.purchasedHashpower = existingPurchased + plan.hashrate; // Add to purchased
      userMining.hashpower = updatedHashPower; // Total = claimed + purchased

      console.log(`Updated mining power for user ${userId}: claimed=${existingClaimed}, purchased=${userMining.purchasedHashpower}, total=${userMining.hashpower}`);
    }

    await userMining.save({ session });

    // Mark purchase as mining power added
    purchase.mining_power_added = true;
    await purchase.save({ session });

    // Commit transaction
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Purchase recorded and mining power updated successfully',
      purchase: {
        id: purchase._id,
        plan_name: plan.name,
        hashrate: plan.hashrate,
        unit: plan.unit,
        duration: plan.duration,
        price_paid: purchase.price_paid,
        currency: purchase.currency,
        purchase_date: purchase.purchase_date,
        existing_hashpower: existingHashPower,
        updated_hashpower: updatedHashPower
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    console.error('Error processing purchase:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process purchase',
      error: error.message
    });
  } finally {
    // End session
    session.endSession();
  }
});

// GET /api/purchases/:userId - Get user's purchase history
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const purchases = await Purchase.find({ user: userId })
      .populate('plan_id')
      .sort({ purchase_date: -1 })
      .select('-__v');

    return res.status(200).json({
      success: true,
      count: purchases.length,
      purchases
    });

  } catch (error) {
    console.error('Error fetching purchases:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch purchases',
      error: error.message
    });
  }
});

export default router;
