import express from "express";
import Withdrawal from "../../models/Withdrawal.js";
import Balance from "../../models/Balance.js";
import mongoose from "mongoose";
import fetch from "node-fetch";
import Client from "lightning-client";
import fs from "fs";
import axios from "axios";

const router = express.Router();
const SPEED_API_KEY = "sk_test_mfoc67r7bbfxZTXAmfoproayetYNmFIrmfoproayCEEsSoxx";

const rpcPath = "/home/pi/.lightning/bitcoin";
const client = new Client(rpcPath);

function isValidSpeedLN(address) {
  const regex = /^[a-zA-Z0-9_-]+@speed\.app$/;
  return regex.test(address);
}

/**
 * Helper function to safely deduct balance with transaction locks
 * @param {string} userId - User ID
 * @param {number} baseAmount - Amount to deduct from BTC_DEPOSIT
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Object>} Updated balance
 */
async function deductBTCDepositBalance(userId, baseAmount, session) {
  const balance = await Balance.findOneAndUpdate(
    {
      user: userId,
      BTC_DEPOSIT: {
        $gte: mongoose.Types.Decimal128.fromString(baseAmount.toString()),
      },
    },
    {
      $inc: {
        BTC_DEPOSIT: mongoose.Types.Decimal128.fromString(
          (-baseAmount).toString()
        ),
      },
    },
    {
      new: true,
      session,
      runValidators: true,
    }
  );

  if (!balance) {
    throw new Error("Insufficient BTC_DEPOSIT balance or user not found");
  }

  return balance;
}

/**
 * Helper function to restore balance in case of failed withdrawal
 * @param {string} userId - User ID
 * @param {number} baseAmount - Amount to restore to BTC_DEPOSIT
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Object>} Updated balance
 */
async function restoreBTCDepositBalance(userId, baseAmount, session) {
  const balance = await Balance.findOneAndUpdate(
    { user: userId },
    {
      $inc: {
        BTC_DEPOSIT: mongoose.Types.Decimal128.fromString(
          baseAmount.toString()
        ),
      },
    },
    {
      new: true,
      session,
      runValidators: true,
      upsert: false,
    }
  );

  if (!balance) {
    throw new Error("User balance not found for restoration");
  }

  return balance;
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
        { txHash: { $regex: search, $options: "i" } },
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
      total,
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
    const withdrawals = await Withdrawal.find({
      userId: req.params.userId,
    }).sort({ created_at: -1 });
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
    res
      .status(400)
      .json({ error: err.message || "Failed to create withdrawal" });
  }
});

/**
 * PATCH approve withdrawal (admin)
 * Calls external API afterwards to handle sending
 */
router.patch("/:id/approve", async (req, res) => {
  try {
    // 1. Load the withdrawal by ID
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    // Check if already processed
    if (withdrawal.status !== "PENDING") {
      return res.status(400).json({
        error: `Cannot approve withdrawal with status: ${withdrawal.status}`,
      });
    }

    // 2. Build Speed "send" request body (hardcoded for test)
    const dataspeed = JSON.stringify({
      amount: 1000,
      currency: withdrawal.asset,
      withdraw_method: "lightning",
      withdraw_request: withdrawal.toAddress,
    });
    console.log("Speed API payload:", dataspeed);

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://api.tryspeed.com/send",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic c2tfdGVzdF9tZm9jNjdyN2JiZnhaVFhBbWZvcHJvYXlldFlObUZJcm1mb3Byb2F5Q0VFc1NveHg6",
      },
      data: dataspeed,
    };

    // 3. Call Speed API with proper error handling
    let responsespeed;
    try {
      responsespeed = await axios.request(config);
    } catch (apiError) {
      console.error("Speed API error details:", {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        message: apiError.message,
      });
      return res.status(500).json({
        error: "Failed to send withdrawal via Speed API",
        details: apiError.response?.data?.error || apiError.message,
      });
    }

    // Validate API response
    if (!responsespeed.data?.id) {
      console.error("Invalid Speed API response:", responsespeed.data);
      return res.status(500).json({
        error: "Speed API returned invalid response format",
        details: responsespeed.data,
      });
    }

    // 4. Update withdrawal record after successful payment
    withdrawal.status = "SENT";
    withdrawal.txHash = responsespeed.data.id; // adjust if Speed returns another identifier
    withdrawal.approvedBy = req.user?.id || "system";
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    // 5. Respond
    return res.json({
      message: "Withdrawal approved and sent",
      withdrawal,
      speed: responsespeed.data,
    });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH reject withdrawal (admin)
 */
router.patch("/:id/reject", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal)
      return res.status(404).json({ error: "Withdrawal not found" });

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
    if (!withdrawal)
      return res.status(404).json({ error: "Withdrawal not found" });

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
    if (!withdrawal)
      return res.status(404).json({ error: "Withdrawal not found" });

    res.json({ message: "Marked as confirmed", withdrawal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/create-speed-payment", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      amount,
      currency = "USD",
      target_currency = "SATS",
      payment_methods = ["lightning"],
      metadata,
      speed_wallet_address,
      baseAmount,
    } = req.body;

    client
      .getinfo()
      .then((info) => {
        console.log("Connected to CLN:", info.id);
      })
      .catch((err) => {
        console.error("Lightning client connection error:", err);
      });

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    if (!baseAmount || baseAmount <= 0) {
      return res
        .status(400)
        .json({ error: "Base amount is required and must be positive" });
    }

    if (!metadata?.user_id) {
      return res.status(400).json({ error: "User ID is required in metadata" });
    }

    if (!speed_wallet_address || !isValidSpeedLN(speed_wallet_address)) {
      return res.status(400).json({ error: "Invalid Speed wallet address" });
    }

    // Start transaction
    await session.startTransaction();

    try {
      // 1. Check and deduct balance first
      const updatedBalance = await deductBTCDepositBalance(
        metadata.user_id,
        baseAmount,
        session
      );
      console.log(
        `Balance deducted for user ${metadata.user_id}: ${baseAmount} from BTC_DEPOSIT`
      );

      // 2. Create withdrawal record
      const withdrawal = await Withdrawal.create(
        [
          {
            userId: metadata.user_id,
            asset: target_currency,
            chain: "BTC",
            toAddress: speed_wallet_address,
            amountNumeric: amount,
            status: "PENDING",
          },
        ],
        { session }
      );

      // 3. Request invoice / payment from Speed API
      const response = await fetch("https://api.tryspeed.com/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " + Buffer.from(SPEED_API_KEY + ":").toString("base64"),
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
        throw new Error(`Speed API error: ${data?.error || "Unknown error"}`);
      }

      if (!data?.id) {
        throw new Error("Speed API did not return a valid invoice");
      }

      // (Currently using /send directly instead of paying a bolt11)
      const dataspeed = JSON.stringify({
        amount: withdrawal.amountNumeric,
        currency: withdrawal.asset,
        withdraw_method: "lightning",
        withdraw_request: withdrawal.toAddress,
        
      });

      const config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "https://api.tryspeed.com/send",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic c2tfdGVzdF9tZm9jNjdyN2JiZnhaVFhBbWZvcHJvYXlldFlObUZJcm1mb3Byb2F5Q0VFc1NveHg6",
        },
        data: dataspeed,
      };

      const responsespeed = await axios.request(config);

      // 5. Update withdrawal record after successful payment
      await Withdrawal.findByIdAndUpdate(
        withdrawal[0]._id,
        {
          status: "SENT",
          txHash: responsespeed.data.id,
          approvedBy: "system",
          approvedAt: new Date(),
        },
        { session }
      );

      await session.commitTransaction();

      // 6. Return result
      return res.json({
        status: "paid",
        // Add anything else you want to expose:
        // speed_response: data,
        // withdrawal_id: withdrawal[0]._id,
        // balance_deducted: baseAmount,
        // remaining_btc_deposit: updatedBalance.BTC_DEPOSIT
      });
    } catch (paymentError) {
      // Rollback transaction on any error
      await session.abortTransaction();

      console.error("Payment processing failed:", paymentError);

      // Return specific error messages
      if (
        paymentError.message.includes("Insufficient BTC_DEPOSIT balance")
      ) {
        return res.status(400).json({
          error: "Insufficient BTC deposit balance",
          details: paymentError.message,
        });
      }

      return res.status(500).json({
        error: "Payment processing failed",
        details: paymentError.message,
      });
    }
  } catch (error) {
    // Ensure transaction is aborted in case of any unexpected error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error("Error creating Speed payment:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  } finally {
    // Always end the session
    await session.endSession();
  }
});

export default router;