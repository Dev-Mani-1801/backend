import express from "express";
import WalletAddress from "../../models/WalletAddress.js";
import { ethers } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import * as bip32 from "bip32";

const router = express.Router();

const EVM_MNEMONIC = process.env.EVM_MNEMONIC;
const BTC_XPUB = process.env.BTC_XPUB;

const evmHdNode = ethers.HDNodeWallet.fromPhrase(EVM_MNEMONIC);

// BTC HD root
const network = bitcoin.networks.bitcoin; // testnet: bitcoin.networks.testnet
const btcNode = bip32.fromBase58(BTC_XPUB, network);

router.get("/:userId/:asset", async (req, res) => {
  try {
    const { userId, asset } = req.params;
    let chain;

    if (["BNB", "USDT", "USDC"].includes(asset)) {
      chain = "bsc";
    } else if (asset === "BTC") {
      chain = "btc";
    } else if (asset === "LTC") {
      chain = "ltc";
    } else {
      return res.status(400).json({ error: "Unsupported asset" });
    }

    // check if address already exists
    let addrRecord = await WalletAddress.findOne({ userId, asset, chain });
    if (addrRecord) {
      return res.json({ address: addrRecord.address });
    }

    // derive a new one
    let idx = await WalletAddress.countDocuments({ userId, chain });
    let address, path;

    if (chain === "bsc") {
      // derive EVM address
      path = `m/44'/60'/0'/0/${idx}`;
      const child = evmHdNode.derivePath(path);
      address = child.address;
    } else if (chain === "btc") {
      // derive BTC bech32 address
      path = `0/${idx}`; // for xpub derivation
      const child = btcNode.derive(idx);
      const { address: btcAddr } = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network,
      });
      address = btcAddr;
    }

    // store in db
    addrRecord = await WalletAddress.create({
      userId,
      chain,
      asset,
      address,
      derivationPath: path,
      idx,
    });

    res.json({ address: addrRecord.address });
  } catch (err) {
    console.error("deposit address error:", err);
    res.status(500).json({ error: "Failed to allocate address" });
  }
});

export default router;
