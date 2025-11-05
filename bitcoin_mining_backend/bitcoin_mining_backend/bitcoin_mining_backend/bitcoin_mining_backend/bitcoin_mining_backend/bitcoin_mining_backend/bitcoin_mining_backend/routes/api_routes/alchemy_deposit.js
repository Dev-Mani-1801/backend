// routes/api_routes/alchemy_deposit.js
import express from "express";
import WalletAddress from "../../models/WalletAddress.js";
import DerivationCounter from "../../models/DerivationCounter.js";
import { ethers, Wallet as EthersWallet } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";
import { subscribeAddress } from "../../webhooks/alchemyWatcher.js";
import { registerBtcAddress } from "../../webhooks/btcWatcher.js";

const router = express.Router();

// master keys
const EVM_MNEMONIC =
  "apple sentence captain mirror prosper magnet erase valid diet inform grant anger";

const BTC_XPRV =
  process.env.BTC_XPRV ||
  "xprv9s21ZrQH143K2vKyFsziz89ahv7mTNwy3EBTEwntdwTvjYKruDXnQH5Mf5qsCAq1N3LyKiDWGXMzcvUufq4dURy7MdduQwTvTvKkhRmNSyR";

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
const btcNetwork = bitcoin.networks.bitcoin;
let btcRootNode = BTC_XPRV ? bip32.fromBase58(BTC_XPRV, btcNetwork) : null;

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
    let address, derivationPath, privateKey;

    if (chain === "bsc") {
      if (evmHdNode) {
        derivationPath = `44'/60'/0'/0/${idx}`;

        const child = evmHdNode.derivePath(derivationPath);

        address = child.address;
        privateKey = child.privateKey;
      } else if (evmSingleWallet) {
        address = evmSingleWallet.address;
        privateKey = evmSingleWallet.privateKey;
      } else throw new Error("No EVM mnemonic/private key");

      // ensure this address is subscribed in Alchemy webhook
      await subscribeAddress(address);
    } else if (chain === "btc") {
      // Core-compatible derivation path: m/84'/0'/0'/0/idx
      derivationPath = `84'/0'/0'/0/${idx}`;

      console.log("===== BTC CHILD DERIVATION DEBUG =====");
      console.log("BTC_XPRV:", BTC_XPRV);
      console.log("idx:", idx);
      console.log("derivationPath:", derivationPath);

      // derive full path
      const child = btcRootNode.derivePath(derivationPath);

      if (!child.privateKey) {
        throw new Error("BTC child does not have private key (are you using xpub?)");
      }

      // get segwit address
      const { address: btcAddr } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(child.publicKey),
        network: btcNetwork,
      });

      console.log("child publicKey (hex):", child.publicKey.toString("hex"));
      console.log("Generated BTC address:", btcAddr);

      address = btcAddr;
      privateKey = child.toWIF();

      console.log("Wallet Private Key: ", privateKey);
      console.log("======================================");

      registerBtcAddress(address);
    }

    const doc = await WalletAddress.create({
      userId,
      chain,
      asset,
      address,
      derivationPath,
      idx,
      privateKey,
    });

    return res.json({ address: doc.address, privateKey: doc.privateKey });
  } catch (err) {
    console.error("deposit address error:", err);
    return res.status(500).json({ error: "Failed to allocate address" });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Supported assets
    const assets = ["BTC", "BNB", "USDT", "USDC"];
    const results = {};

    for (const asset of assets) {
      let chain;
      if (["BNB", "USDT", "USDC"].includes(asset)) chain = "bsc";
      else if (asset === "BTC") chain = "btc";
      else continue;

      // Check if wallet already exists
      let existing = await WalletAddress.findOne({ userId, asset, chain });
      if (existing) {
        results[asset] = existing.address;
        continue;
      }

      // Otherwise, create new wallet
      const idx = await getNextIndexForChain(chain);
      let address, derivationPath, privateKey;

      if (chain === "bsc") {
        if (evmHdNode) {
          derivationPath = `44'/60'/0'/0/${idx}`;
          const child = evmHdNode.derivePath(derivationPath);
          address = child.address;
          privateKey = child.privateKey;
        } else if (evmSingleWallet) {
          address = evmSingleWallet.address;
          privateKey = evmSingleWallet.privateKey;
        } else {
          throw new Error("No EVM mnemonic/private key");
        }

        await subscribeAddress(address);
      } else if (chain === "btc") {
        derivationPath = `84'/0'/0'/0/${idx}`;
        const child = btcRootNode.derivePath(derivationPath);

        if (!child.privateKey) {
          throw new Error("BTC child does not have private key (are you using xpub?)");
        }

        const { address: btcAddr } = bitcoin.payments.p2wpkh({
          pubkey: Buffer.from(child.publicKey),
          network: btcNetwork,
        });

        address = btcAddr;
        privateKey = child.toWIF();

        registerBtcAddress(address);
      }

      const doc = await WalletAddress.create({
        userId,
        chain,
        asset,
        address,
        derivationPath,
        idx,
        privateKey,
      });

      results[asset] = doc.address;
    }

    return res.json(results);
  } catch (err) {
    console.error("deposit address error:", err);
    return res.status(500).json({ error: "Failed to allocate address" });
  }
});

export default router;
