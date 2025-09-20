import express from 'express';
import Transaction from '../../models/Transaction.js';
import mongoose from 'mongoose';

const router = express.Router();

// POST /api/transactions/create
router.post('/create', async (req, res) => {
  try {
    const {
      user, // should be a valid ObjectId
      amount,
      method_crypto,
      method_bank_transfer,
      method_payment_gateway,
      crypto_type,
      crypto_wallet_address,
      transaction_id,
      plan_id,
      deposit,
      withdraw,
      extra_details
    } = req.body;

    // Basic validations
    if (!user || !plan_id || !transaction_id || amount == null) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Check for valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(user) || !mongoose.Types.ObjectId.isValid(plan_id)) {
      return res.status(400).json({ error: 'Invalid user or plan ID.' });
    }

    // Check if transaction ID already exists
    const existingTx = await Transaction.findOne({ transaction_id });
    if (existingTx) {
      return res.status(409).json({ error: 'Transaction ID already exists.' });
    }

    const newTx = new Transaction({
      user,
      amount,
      method_crypto: !!method_crypto,
      method_bank_transfer: !!method_bank_transfer,
      method_payment_gateway: !!method_payment_gateway,
      crypto_type: crypto_type || null,
      crypto_wallet_address: crypto_wallet_address || null,
      transaction_id,
      plan_id,
      deposit: !!deposit,
      withdraw: !!withdraw,
      extra_details: extra_details || null
    });

    await newTx.save();

    return res.status(201).json({ message: 'Transaction created successfully', transaction: newTx });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get all transactions for a specific user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const transactions = await Transaction.find({ user: userId }).sort({ date_created: -1 });

    res.status(200).json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (err) {
    console.error('Error fetching user transactions:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.get('/all/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Fetch deposits and withdrawals
    const [deposits, withdrawals] = await Promise.all([
      Deposit.find({ user: userId }).sort({ createdAt: -1 }).lean(),
      Withdrawal.find({ userId }).sort({ created_at: -1 }).lean()
    ]);

    // 2. Collect all unique assets to fetch prices
    const assets = new Set([
      ...deposits.map(d => d.asset.toUpperCase()),
      ...withdrawals.map(w => w.asset.toUpperCase())
    ]);

    // Map asset symbols to CoinGecko IDs
    const assetMap = { BTC: 'bitcoin', USDT: 'tether', USDC: 'usd-coin' };

    const ids = Array.from(assets)
      .map(a => assetMap[a])
      .filter(Boolean)
      .join(',');

    let prices = {};
    if (ids.length > 0) {
      const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      const priceJson = await priceRes.json();
      prices = priceJson;
    }

    // 3. Convert amount to USD
    const convertToUSD = (asset, amount) => {
      const id = assetMap[asset.toUpperCase()];
      if (!id || !prices[id]) return null;
      const usdPrice = prices[id].usd || 0;
      return (parseFloat(amount.toString()) * usdPrice).toFixed(2);
    };

    // 4. Format deposits
    const depositTxs = deposits.map(d => ({
      type: 'DEPOSIT',
      method: d.chain,
      date: d.createdAt.toISOString(),
      amountNumeric: { $numberDecimal: convertToUSD(d.asset, d.amountNumeric) },
      isPositive: true
    }));

    // 5. Format withdrawals
    const withdrawalTxs = withdrawals.map(w => ({
      type: 'WITHDRAW',
      method: w.chain,
      date: w.created_at.toISOString(),
      amountNumeric: { $numberDecimal: convertToUSD(w.asset, w.amountNumeric) },
      isPositive: false
    }));

    // 6. Merge and sort by date descending
    const transactions = [...depositTxs, ...withdrawalTxs].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    return res.status(200).json({
      success: true,
      count: transactions.length,
      transactions
    });

  } catch (err) {
    console.error('Error fetching user transactions:', err);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
});

export default router;
