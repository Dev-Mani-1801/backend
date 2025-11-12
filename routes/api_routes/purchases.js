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
    const existingClaimedHashPower = userMining ? userMining.hashpower : 0;
    const existingPurchasedHashPower = userMining ? (userMining.purchased_hashpower || 0) : 0;
    const existingTotalHashPower = existingClaimedHashPower + existingPurchasedHashPower;

    // Calculate updated hashpower (add to purchased_hashpower)
    const updatedPurchasedHashPower = existingPurchasedHashPower + plan.hashrate;
    const updatedTotalHashPower = existingClaimedHashPower + updatedPurchasedHashPower;

    console.log(`Purchased hashpower update: ${existingPurchasedHashPower} -> ${updatedPurchasedHashPower}`);
    console.log(`Total hashpower update: ${existingTotalHashPower} -> ${updatedTotalHashPower}`);

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
      existing_hashpower: existingTotalHashPower,
      updated_hashpower: updatedTotalHashPower,
      mining_power_added: false
    });

    await purchase.save({ session });
    console.log('Purchase saved:', purchase._id);

    // Update user mining power
    if (!userMining) {
      // Create new mining details if not exists
      userMining = new UserMiningDetail({
        user: userId,
        hashpower: 0,                          // Claimed hashpower starts at 0
        purchased_hashpower: plan.hashrate,    // Add purchased hashpower
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
      // Add hashrate to purchased_hashpower (persists across midnight)
      userMining.purchased_hashpower = updatedPurchasedHashPower;
      console.log(`Updated purchased mining power for user ${userId}: ${userMining.purchased_hashpower}`);
      console.log(`Total mining power for user ${userId}: ${userMining.hashpower + userMining.purchased_hashpower}`);
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
        existing_total_hashpower: existingTotalHashPower,
        existing_claimed_hashpower: existingClaimedHashPower,
        existing_purchased_hashpower: existingPurchasedHashPower,
        updated_purchased_hashpower: updatedPurchasedHashPower,
        updated_total_hashpower: updatedTotalHashPower
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
