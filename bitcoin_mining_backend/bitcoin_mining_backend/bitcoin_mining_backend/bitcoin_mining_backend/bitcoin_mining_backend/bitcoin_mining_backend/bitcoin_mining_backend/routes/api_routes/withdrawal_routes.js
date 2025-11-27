import express from "express";
import Withdrawal from "../../models/Withdrawal.js";
import fetch from "node-fetch";
import Client from "lightning-client";
import fs from "fs";

const router = express.Router();
const SPEED_API_KEY = process.env.SPEED_API_KEY;

const rpcPath = "/home/pi/.lightning/bitcoin";
const client = new Client(rpcPath);

function isValidSpeedLN(address) {
  const regex = /^[a-zA-Z0-9_-]+@speed\.app$/;
  return regex.test(address);
}

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
    let { userId, asset, chain, toAddress, amountNumeric } = req.body;

    if (!userId || !asset || !chain || !toAddress || !amountNumeric) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (chain === "Crypto") {
      chain = asset; // BTC, USDT, USDC
    } else if (chain === "BANK") {
      chain = "BANK";
    }

    // if (parseFloat(amountNumeric) < 10) {
    //   return res.status(400).json({ error: "Minimum withdrawal is $10" });
    // }

    const withdrawal = await Withdrawal.create({
      userId,
      asset,
      chain,
      toAddress,
      amountNumeric,
    });

    res.status(201).json({
      message: "Withdrawal request created successfully",
      withdrawal,
    });
  } catch (err) {
    console.error("Error creating withdrawal:", err);
    res.status(400).json({ error: err.message || "Failed to create withdrawal" });
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
    const {
      amount,
      currency = "USD",
      target_currency = "SATS",
      payment_methods = ["lightning"],
      metadata,
      speed_wallet_address,
    } = req.body;

    client.getinfo().then(info => {
      console.log("Connected to CLN:", info.id);
    }).catch(err => {
      console.error("Lightning client connection error:", err);
    });

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    if (!speed_wallet_address || !isValidSpeedLN(speed_wallet_address)) {
      return res.status(400).json({ error: "Invalid Speed wallet address" });
    }

    // 1. Request invoice from Speed API
    const response = await fetch("https://api.tryspeed.com/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(SPEED_API_KEY + ":").toString("base64"),
        "speed-version": "2022-10-15",
      },
      body: JSON.stringify({
        amount,
        currency,
        target_currency,
        payment_methods,
        metadata,
        to: speed_wallet_address, // tell Speed who to pay
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (!data.invoice || !data.invoice.bolt11) {
      return res
        .status(500)
        .json({ error: "Speed API did not return a valid invoice" });
    }

    const bolt11 = data.invoice.bolt11;

    // 2. Pay the invoice using Core Lightning
    const payment = await client.pay(bolt11);

    // 3. Return result
    res.json({
      status: "paid",
      preimage: payment.payment_preimage,
      hash: payment.payment_hash,
      amount_msat: payment.amount_msat,
      fees_msat: payment.fee_msat,
      speed_response: data,
    });
  } catch (error) {
    console.error("Error creating Speed payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
