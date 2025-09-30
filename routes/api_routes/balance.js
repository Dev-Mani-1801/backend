// api_routes/balance.js
import express from "express";
import Balance from "../../models/Balance.js";
import BalanceHistory from "../../models/BalanceHistory.js";

const router = express.Router();

// GET balance for a user
router.get("/balance", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    let balance = await Balance.findOne({ user: userId });
    if (!balance) {
      balance = await Balance.create({ user: userId });
    }

    res.json({ balance });
  } catch (err) {
    console.error("Error fetching balance:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST update balance
router.post("/balance", async (req, res) => {
  try {
    const { userId, asset, amount } = req.body;
    if (!userId || !asset || amount === undefined) {
      return res
        .status(400)
        .json({ error: "Missing required fields (userId, asset, amount)" });
    }

    let balance = await Balance.findOne({ user: userId });
    // console.log("Balance: ", balance) // null for new users

    if (!balance) {
      balance = await Balance.create({ user: userId });
    }

    if (!["BNB", "USDT", "USDC", "BTC", "LTC"].includes(asset)) {
      return res.status(400).json({ error: "Invalid asset type" });
    }

    balance[asset] = amount;
    await balance.save();

    console.log(`Saving BTC Balance for User: ${userId}, Balance: ${amount}`);

    res.json({ success: true, balance });
  } catch (err) {
    console.error("Error updating balance:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/history", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const history = await BalanceHistory.find({ user: userId })
    .sort({ date: -1 })
    .limit(10)
    .lean();

    res.json({ success: true, balances: history });
  } catch (err) {
    console.error("Error fetching balance history:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
