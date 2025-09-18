// /btcWatcher.js
import * as zmq from "zeromq";
import * as bitcoin from "bitcoinjs-lib";
import WalletAddress from "../models/WalletAddress.js";
import Deposit from "../models/Deposit.js";
import Balance from "../models/Balance.js";

// ---- ENV ----
const BTC_NETWORK = (process.env.BTC_NETWORK || "mainnet").toLowerCase();
const BTC_ZMQ_TX = process.env.BTC_ZMQ_TX || "tcp://127.0.0.1:28332";
const BTC_ZMQ_BLOCK = process.env.BTC_ZMQ_BLOCK || "tcp://127.0.0.1:28333";
const BTC_MIN_CONFS = Number(process.env.BTC_MIN_CONFS || "1");

// RPC
const BTC_RPC_URL = process.env.BTC_RPC_URL || "http://btcuser:btmining_112@127.0.0.1:18332/";

// Sweeper target wallet
const BTC_HOT_WALLET = process.env.BTC_HOT_WALLET;

// ---- NETWORK ----
const network =
  BTC_NETWORK === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

// ---- in-memory set of watched deposit addresses ----
const watched = new Set();

// preload addresses on boot
async function loadWatchedAddresses() {
  const addrs = await WalletAddress.find({ chain: "btc" }, { address: 1 }).lean();
  for (const a of addrs) watched.add(a.address);
  console.log(`BTC watcher: preloaded ${watched.size} addresses to watch`);
}

export function registerBtcAddress(addr) {
  watched.add(addr);
}

// ---- helpers ----
async function rpc(method, params = []) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params });

  // Parse from env
  const url = new URL("http://127.0.0.1:8332");
  const authUser = process.env.BTC_RPC_USER || "btcuser";
  const authPass = process.env.BTC_RPC_PASS || "btmining_112";

  const res = await fetch(url.toString(), {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + Buffer.from(`${authUser}:${authPass}`).toString("base64"),
    },
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method} error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// ---- Sweeper ----
async function sweepDeposit(dep) {
  if (!BTC_HOT_WALLET) {
    console.warn("Sweeper: BTC_HOT_WALLET not configured, skipping sweep");
    return;
  }

  try {
    // Sweep using RPC sendtoaddress
    const txid = await rpc("sendtoaddress", [BTC_HOT_WALLET, dep.amountNumeric / 1e8]);

    dep.swept = true;
    dep.sweptTx = txid;
    dep.sweptAt = new Date();
    await dep.save();

    console.log(`Sweeper: swept ${dep.amountNumeric} sats from deposit ${dep.txHash} to hot wallet (txid=${txid})`);
  } catch (e) {
    console.error("Sweeper error:", e.message);
  }
}

// ---- confirmations updater ----
async function updateConfirmationsForPending(txids) {
  for (const txid of txids) {
    try {
      const tx = await rpc("getrawtransaction", [txid, true]); // verbose
      const confs = tx.confirmations || 0;

      const dep = await Deposit.findOne({ txHash: txid, chain: "btc" });
      if (!dep) continue;

      if (confs !== dep.confirmations) {
        dep.confirmations = confs;

        // credit when reaching threshold & not yet credited
        if (!dep.credited && confs >= BTC_MIN_CONFS) {
          dep.credited = true;
          dep.creditedAt = new Date();
          console.log("BitcoinWatcher Depositing Funds", dep.userId, dep.amountNumeric);
          await Balance.updateOne(
            { userId: dep.userId },
            { $inc: { BTC: dep.amountNumeric } },
            { upsert: true }
          );
          console.log(`BTC credited user ${dep.userId} ${dep.amountNumeric} sats (tx ${txid})`);

          // Trigger sweeper after credit
          await sweepDeposit(dep);
        }

        await dep.save();
      }
    } catch (e) {
      console.error("confirmations update error:", e.message);
    }
  }
}

// ---- raw tx parser ----
async function handleRawTx(txHex) {
  const tx = bitcoin.Transaction.fromHex(txHex);
  const txid = tx.getId();

  // scan outputs for watched addresses
  const hits = [];
  for (let n = 0; n < tx.outs.length; n++) {
    const out = tx.outs[n];
    try {
      const addr = bitcoin.address.fromOutputScript(out.script, network);
      if (watched.has(addr)) {
        hits.push({ n, addr, value: out.value }); // out.value is sats
      }
    } catch {
      // non-standard script or can't decode -> ignore
    }
  }

  if (hits.length === 0) return;

  for (const hit of hits) {
    const rec = await WalletAddress.findOne({ chain: "btc", address: hit.addr });
    if (!rec) continue;

    // idempotent upsert
    await Deposit.updateOne(
      { txHash: txid, chain: "btc", address: hit.addr },
      {
        $setOnInsert: {
          userId: rec.userId,
          asset: "BTC",
          chain: "btc",
          amountNumeric: hit.value, // sats
          confirmations: 0,
          credited: false,
          swept: false,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    console.log(`BTC deposit seen -> user ${rec.userId} addr ${hit.addr} +${hit.value} sats (tx ${txid})`);
  }
}

// ---- block handler ----
async function handleRawBlock(_blockHex) {
  // simple strategy: check the last N uncredited deps each block
  const pending = await Deposit.find({ chain: "btc", credited: false }).limit(200).lean();
  const txids = [...new Set(pending.map((d) => d.txHash))];
  if (txids.length) await updateConfirmationsForPending(txids);
}

// ---- main watcher ----
export async function connectBTCWatcher() {
  await loadWatchedAddresses();

  // ZMQ sockets
  const txSock = new zmq.Subscriber();
  txSock.connect(BTC_ZMQ_TX);
  txSock.subscribe("rawtx");

  const blockSock = new zmq.Subscriber();
  blockSock.connect(BTC_ZMQ_BLOCK);
  blockSock.subscribe("rawblock");

  console.log(`BTC watcher connected to ZMQ: tx=${BTC_ZMQ_TX}, block=${BTC_ZMQ_BLOCK}`);

  (async () => {
    for await (const [topic, body] of txSock) {
      if (topic.toString() !== "rawtx") continue;
      const txHex = body.toString("hex");
      try {
        await handleRawTx(txHex);
      } catch (e) {
        console.error("rawtx handle error:", e.message);
      }
    }
  })();

  (async () => {
    for await (const [topic, body] of blockSock) {
      if (topic.toString() !== "rawblock") continue;
      const blockHex = body.toString("hex");
      try {
        await handleRawBlock(blockHex);
      } catch (e) {
        console.error("rawblock handle error:", e.message);
      }
    }
  })();
}

// ---- utils ----
export function getWatchedAddressesCount() {
  return watched.size;
}

export function getWatchedAddresses() {
  return Array.from(watched);
}
