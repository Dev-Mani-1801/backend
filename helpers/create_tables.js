import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';

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

async function tables_check() {
    await ensureTransactionsCollection();
}

export default tables_check