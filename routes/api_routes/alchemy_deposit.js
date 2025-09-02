// routes/api_routes/alchemy_deposit.js
import express from "express";
import WalletAddress from "../../models/WalletAddress.js";
import DerivationCounter from "../../models/DerivationCounter.js";
import { ethers, Wallet as EthersWallet } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";
import { subscribeAddress } from "../../webhooks/alchemyWatcher.js"
// import { registerBtcAddress } from "../../webhooks/btcWatcher.js";

const router = express.Router();

// env
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_WEBHOOK_ID = process.env.ALCHEMY_WEBHOOK_ID;
const ALCHEMY_URL = `https://dashboard.alchemy.com/api/update-webhook-addresses`;

// master keys
const EVM_MNEMONIC = process.env.EVM_MNEMONIC;
const BTC_XPUB = process.env.BTC_XPUB;

// init EVM wallet
let evmHdNode = null;
let evmSingleWallet = null;
if (EVM_MNEMONIC) {
  evmHdNode = ethers.HDNodeWallet.fromPhrase(EVM_MNEMONIC);
} else if (process.env.EVM_PRIVATE_KEY) {
  evmSingleWallet = new EthersWallet(process.env.EVM_PRIVATE_KEY);
}

// init BTC
const bip32 = BIP32Factory(ecc);
const btcNetwork = bitcoin.networks.testnet;
let btcNode = BTC_XPUB ? bip32.fromBase58(BTC_XPUB, btcNetwork) : null;

/**
 * Helpers
 */
async function getNextIndexForChain(chain) {
  const counter = await DerivationCounter.findOneAndUpdate(
    { chain },
    { $inc: { nextIndex: 1 } },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return counter.nextIndex - 1;
}

/**
 * GET /deposit-address/:userId/:asset
 */
router.get("/:userId/:asset", async (req, res) => {
  try {
    const { userId } = req.params;
    const asset = String(req.params.asset || "").toUpperCase();

    let chain;
    if (["BNB", "USDT", "USDC"].includes(asset)) chain = "bsc";
    else if (asset === "BTC") chain = "btc";
    else return res.status(400).json({ error: "Unsupported asset" });

    // existing?
    const existing = await WalletAddress.findOne({ userId, asset, chain });
    if (existing) return res.json({ address: existing.address });

    const idx = await getNextIndexForChain(chain);
    let address, derivationPath;

    if (chain === "bsc") {
      if (evmHdNode) {
        derivationPath = `44'/60'/0'/0/${idx}`;
        const child = evmHdNode.derivePath(derivationPath);
        address = child.address;
      } else if (evmSingleWallet) {
        address = evmSingleWallet.address;
      } else throw new Error("No EVM mnemonic/private key");

      // ensure this address is subscribed in Alchemy webhook
      await subscribeAddress(address);

    } else if (chain === "btc") {
      derivationPath = `0/${idx}`;
      const child = btcNode.derive(idx);
      const { address: btcAddr } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(child.publicKey),
        network: btcNetwork,
      });
      address = btcAddr;

      // registerBtcAddress(address);
      
    }

    const doc = await WalletAddress.create({
      userId,
      chain,
      asset,
      address,
      derivationPath,
      idx,
    });

    return res.json({ address: doc.address });
  } catch (err) {
    console.error("deposit address error:", err);
    return res.status(500).json({ error: "Failed to allocate address" });
  }
});

export default router;
