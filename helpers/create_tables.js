import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';

async function ensureTransactionsCollection() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const collectionNames = collections.map(col => col.name);

  if (!collectionNames.includes('transactions')) {
    const dummy = new Transaction({
      user: new mongoose.Types.ObjectId(),
      amount: 0,
      method_crypto: false,
      method_bank_transfer: false,
      method_payment_gateway: false,
      transaction_id: 'init-transaction-id'
    });

    try {
      await dummy.save();
      await Transaction.deleteOne({ transaction_id: 'init-transaction-id' });
      console.log('`transactions` collection initialized.');
    } catch (err) {
      console.warn('Could not create transactions collection:', err.message);
    }
  } else {
    console.log('`transactions` collection already exists.');
  }
}

async function ensureSubscriptionPlansCollection() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const collectionNames = collections.map(col => col.name);

  if (!collectionNames.includes('subscriptionplans')) {
    try {
      // Create dummy plan and delete it to trigger collection creation
      const dummy = new SubscriptionPlan({
        name: 'Dummy Plan',
        id: 'init-plan-id',
        hashrate: 0,
        duration: 0,
        maintenance_cost: 0,
        plan_cost: 0
      });

      await dummy.save();
      await SubscriptionPlan.deleteOne({ id: 'init-plan-id' });

      console.log('`subscriptionplans` collection initialized.');
    } catch (err) {
      console.warn('Could not create subscriptionplans collection:', err.message);
    }
  } else {
    console.log('`subscriptionplans` collection already exists.');
  }
}

async function tables_check() {
    await ensureSubscriptionPlansCollection();
    await ensureTransactionsCollection();
}

export default tables_check