
// routes/api_routes/alchemy_deposit.js
import express from "express";
import WalletAddress from "../../models/WalletAddress.js";
import DerivationCounter from "../../models/DerivationCounter.js";
import { ethers, Wallet as EthersWallet } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";

const router = express.Router();

// env
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY || "";

const EVM_MNEMONIC = "apple sentence captain mirror prosper magnet erase valid diet inform grant anger";
const BTC_XPUB = "xpub6CHYaKspRj8fMP21e7HvSFYg3fUJFTXUU7ujLnHLC7dhoq2CUrqnvhbMLZ1XgrmTYxtjLt2WrgoFMKkUPp88Kof1K4Ykbe6Neqn33VksMHc";

// validate
if (!EVM_MNEMONIC && !EVM_PRIVATE_KEY) {
  console.warn("Warning: No EVM_MNEMONIC or EVM_PRIVATE_KEY provided. BSC derivation will fail.");
}
if (!BTC_XPUB) {
  console.warn("Warning: No BTC_XPUB provided. BTC derivation will fail.");
}

// EVM hd wallet (ethers v6)
let evmHdNode = null;
let evmSingleWallet = null;
try {
  if (EVM_MNEMONIC) {
    evmHdNode = ethers.HDNodeWallet.fromPhrase(EVM_MNEMONIC);
  } else if (EVM_PRIVATE_KEY) {
    evmSingleWallet = new EthersWallet(EVM_PRIVATE_KEY); // single address flow
  }
} catch (e) {
  console.error("Failed to initialize EVM wallet:", e);
  throw e;
}

// BTC bip32
const bip32 = BIP32Factory(ecc);
const btcNetwork = bitcoin.networks.bitcoin; // change to .testnet if needed
let btcNode = null;
try {
  if (BTC_XPUB) {
    btcNode = bip32.fromBase58(BTC_XPUB, btcNetwork);
  }
} catch (e) {
  console.error("Failed to init BTC node from XPUB:", e);
  throw e;
}

/**
 * Helpers
 */
async function getNextIndexForChain(chain) {
  // atomically increment nextIndex and return the previous index
  // after increment, counter.nextIndex is the "next" value, so previous = nextIndex - 1
  const counter = await DerivationCounter.findOneAndUpdate(
    { chain },
    { $inc: { nextIndex: 1 } },
    { upsert: true, returnDocument: "after" }
  ).lean();
  return counter.nextIndex - 1;
}

/**
 * GET /deposit-address/:userId/:asset
 * returns existing deposit address or allocates a new one (atomic idx generation)
 */
router.get("/:userId/:asset", async (req, res) => {
  try {
    const { userId } = req.params;
    const asset = String(req.params.asset || "").toUpperCase();

    let chain;
    if (["BNB", "USDT", "USDC"].includes(asset)) chain = "bsc";
    else if (asset === "BTC") chain = "btc";
    else return res.status(400).json({ error: "Unsupported asset" });

    // If user already has an address for this user+asset+chain, return it.
    const existing = await WalletAddress.findOne({ userId, asset, chain });
    if (existing) return res.json({ address: existing.address });

    // We will loop a few times to handle the (extremely rare) duplicate key race
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const idx = await getNextIndexForChain(chain);

      let address;
      let derivationPath;

      if (chain === "bsc") {
        // EVM: if you have mnemonic -> derive; else if you have single private key -> reuse single address
        if (evmHdNode) {
          derivationPath = `44'/60'/0'/0/${idx}`; // ethers v6: do NOT include leading "m/"
          const child = evmHdNode.derivePath(derivationPath);
          address = child.address;
        } else if (evmSingleWallet) {
          // fallback: single hot-wallet address - not recommended for per-user uniqueness
          derivationPath = null;
          address = evmSingleWallet.address;
        } else {
          throw new Error("No EVM mnemonic or private key available for BSC derivation");
        }
      } else if (chain === "btc") {
        if (!btcNode) throw new Error("No BTC_XPUB available for BTC derivation");
        derivationPath = `0/${idx}`;
        // NOTE: depending on how your XPUB was exported you may need btcNode.derive(0).derive(idx)
        const child = btcNode.derive(idx);
        const { address: btcAddr } = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(child.publicKey),
          network: btcNetwork,
        });
        address = btcAddr;
      } else {
        throw new Error("Unsupported chain");
      }

      try {
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
        // If duplicate key on address - another process grabbed it unexpectedly; retry with next idx
        const isDupKey = err && err.code === 11000;
        console.warn(`Attempt ${attempt} failed creating address (dup=${isDupKey}):`, err?.message || err);
        if (isDupKey) {
          // continue the loop to get a fresh index and try again
          continue;
        }
        // Any other error -> propagate
        throw err;
      }
    }

    // if we exhausted attempts
    return res.status(500).json({ error: "Failed to allocate address after retries" });
  } catch (err) {
    console.error("deposit address error:", err);
    return res.status(500).json({ error: "Failed to allocate address" });
  }
});

export default router;
