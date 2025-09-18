/**
 * create_descriptor_wallet.js
 *
 * Requirements:
 *  - Node 18+ (or any Node with fetch available; otherwise install node-fetch)
 *  - bitcoin core RPC running and accessible
 *  - Environment variables:
 *      BTC_RPC_USER
 *      BTC_RPC_PASS
 *      BTC_RPC_HOST  (optional, default: 127.0.0.1)
 *      BTC_RPC_PORT  (optional, default: 8332)
 *
 * What it does:
 *  - create a descriptor wallet (if not exists)
 *  - generate a new receive address
 *  - call listdescriptors true to get descriptors including private keys
 *  - save descriptors JSON to ~/.bitcoin/wallets/<walletName>-backup.json
 *
 * Usage:
 *   BTC_RPC_USER=rpcuser BTC_RPC_PASS=rpcpass node create_descriptor_wallet.js
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const RPC_USER = 'btcuser';
const RPC_PASS = 'btmining_112';
const RPC_HOST = process.env.BTC_RPC_HOST || '127.0.0.1';
const RPC_PORT = process.env.BTC_RPC_PORT || '8332';

if (!RPC_USER || !RPC_PASS) {
  console.error('ERROR: Set BTC_RPC_USER and BTC_RPC_PASS environment variables.');
  process.exit(1);
}

const rpcBaseUrl = `http://${RPC_HOST}:${RPC_PORT}`;

let idCounter = 0;
async function rpcCall(method, params = [], walletName = null) {
  const url = walletName ? `${rpcBaseUrl}/wallet/${encodeURIComponent(walletName)}` : rpcBaseUrl;
  const body = {
    jsonrpc: "1.0",
    id: `${++idCounter}`,
    method,
    params
  };

  const auth = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.error) {
    const err = json.error;
    const msg = typeof err === 'object' ? `${err.code}: ${err.message}` : String(err);
    throw new Error(`RPC error: ${msg}`);
  }
  return json.result;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
}

(async () => {
  try {
    // Wallet name with timestamp so it's unlikely to collide
    const walletName = `descriptor-wallet-${Date.now()}`;

    console.log(`Creating descriptor wallet: ${walletName}`);

    // createwallet params:
    // wallet_name, disable_private_keys=false, blank=false, passphrase="", avoid_reuse=false, descriptors=true, load_on_startup=true
    try {
      const createRes = await rpcCall('createwallet', [walletName, false, false, "", false, true, true]);
      console.log('createwallet result:', createRes);
    } catch (err) {
      // If wallet already exists, try to load it
      const msg = String(err);
      if (msg.includes('Wallet file verification failed') || msg.includes('already exists')) {
        console.warn(`Wallet "${walletName}" may already exist or couldn't be created: ${msg}`);
        console.log(`Attempting to load wallet "${walletName}"...`);
        await rpcCall('loadwallet', [walletName]);
      } else {
        throw err;
      }
    }

    // Generate a new address (defaults to the wallet created via wallet endpoint)
    console.log('Generating a new bech32 address...');
    const newAddress = await rpcCall('getnewaddress', ["", "bech32"], walletName);
    console.log('New address:', newAddress);

    // Fetch descriptors with private material included
    console.log('Fetching descriptors (including private key material)...');

    // listdescriptors takes a boolean include_private
    const descriptors = await rpcCall('listdescriptors', [true], walletName);

    // Prepare backup directory under ~/.bitcoin/wallets
    const baseDir = path.join(os.homedir(), '.bitcoin', 'wallets');
    ensureDir(baseDir);

    const backupPath = path.join(baseDir, `${walletName}-backup.json`);

    // Save a small metadata wrapper along with descriptors
    const saveObject = {
      walletName,
      createdAt: new Date().toISOString(),
      bitcoindRpc: {
        host: RPC_HOST,
        port: RPC_PORT
      },
      descriptors
    };

    fs.writeFileSync(backupPath, JSON.stringify(saveObject, null, 2), { mode: 0o600 });

    console.log(`Descriptors saved to: ${backupPath}`);
    console.log('*** IMPORTANT: This file contains private key material (xprv). Keep it secure! ***');
    console.log(`Wallet ready. Receive address: ${newAddress}`);

  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
