import express from "express";
import Withdrawal from "../../models/Withdrawal.js";

const router = express.Router();
const SPEED_API_KEY = 'sk_test_mfoc67r7bbfxZTXAmfoproayetYNmFIrmfoproayCEEsSoxx';

/**
 * GET all withdrawals (admin)
 * Supports pagination & search by userId or status
 */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const query = {};
    if (search) {
      // Search by userId or status or txHash
      query.$or = [
        { userId: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
        { txHash: { $regex: search, $options: "i" } }
      ];
    }

    const withdrawals = await Withdrawal.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Withdrawal.countDocuments(query);

    res.render("withdrawals/index", {
      title: "Withdrawals",
      user: req.user,
      withdrawals,
      page: Number(page),
      limit: Number(limit),
      total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET withdrawals by userId (for user dashboard / mobile)
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.params.userId }).sort({ created_at: -1 });
    res.json(withdrawals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST create new withdrawal (mobile app)
 * Status will be PENDING by default
 */
router.post("/", async (req, res) => {
  try {
    const { userId, asset, chain, toAddress, amountNumeric } = req.body;
    const withdrawal = await Withdrawal.create({ userId, asset, chain, toAddress, amountNumeric });
    res.status(201).json(withdrawal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PATCH approve withdrawal (admin)
 * Calls external API afterwards to handle sending
 */
router.patch("/:id/approve", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

    withdrawal.status = "APPROVED";
    withdrawal.approvedBy = req.user?.id || "admin";
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    // TODO: Call external API (payment gateway / blockchain service)
    // Example: await sendFunds(withdrawal);

    res.json({ message: "Withdrawal approved", withdrawal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH reject withdrawal (admin)
 */
router.patch("/:id/reject", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

    withdrawal.status = "FAILED";
    await withdrawal.save();

    // TODO: Optionally notify user

    res.json({ message: "Withdrawal rejected", withdrawal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH mark as sent (after blockchain/bank tx is done)
 */
router.patch("/:id/sent", async (req, res) => {
  try {
    const { txHash } = req.body;
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.id,
      { status: "SENT", txHash },
      { new: true }
    );
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

    res.json({ message: "Marked as sent", withdrawal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH mark as confirmed (after confirmations)
 */
router.patch("/:id/confirm", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.id,
      { status: "CONFIRMED" },
      { new: true }
    );
    if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

    res.json({ message: "Marked as confirmed", withdrawal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/create-speed-payment", async (req, res) => {
  try {
    const { amount, currency = 'USD', target_currency = 'SATS', payment_methods = ['lightning'], metadata } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const response = await fetch('https://api.tryspeed.com/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(SPEED_API_KEY + ':').toString('base64'),
        'speed-version': '2022-10-15'
      },
      body: JSON.stringify({
        amount,
        currency,
        target_currency,
        payment_methods,
        metadata
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);

  } catch (error) {
    console.error('Error creating Speed payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
