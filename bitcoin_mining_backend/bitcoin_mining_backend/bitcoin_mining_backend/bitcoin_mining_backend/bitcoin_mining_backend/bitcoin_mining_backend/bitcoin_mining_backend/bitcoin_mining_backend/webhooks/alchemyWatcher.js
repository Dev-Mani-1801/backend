// ws/alchemyWatcher.js
import WebSocket from "ws";
import WalletAddress from "../models/WalletAddress.js";

// const ALCHEMY_WS_URL = process.env.ALCHEMY_WSS_URL;
const ALCHEMY_WS_URL = 'wss://bnb-mainnet.g.alchemy.com/v2/j5Gu8NRwY7FwupLnzayLE';

let socket;
const subscribedAddresses = new Set();

async function connectAlchemyWS() {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(ALCHEMY_WS_URL);

    socket.on("open", async () => {
      console.log("Connected to Alchemy WS");

      // Resubscribe all wallets from DB on restart
      const wallets = await WalletAddress.find({ chain: "bsc" }); // only EVM here
      wallets.forEach((w) => subscribeAddress(w.address));

      resolve(socket);
    });

    socket.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Subscription ack
        if (msg.id && msg.result) {
          console.log("Subscription successful. ID:", msg.result);
          return;
        }

        // Incoming tx
        if (msg.params?.result) {
          const tx = msg.params.result;
          const to = tx.to?.toLowerCase();

          if (to && subscribedAddresses.has(to)) {
            console.log(`Deposit detected:`, {
              asset: tx.asset,
              amount: Number(tx.value) / 10 ** tx.decimals,
              from: tx.from,
              to,
            });

            // update balances in DB
          }
        }
      } catch (err) {
        console.error("WS message error:", err);
      }
    });

    socket.on("close", () => {
      console.log("WS closed, reconnecting in 5s...");
      setTimeout(() => connectAlchemyWS().catch(console.error), 5000);
    });

    socket.on("error", (err) => {
      console.error("WS error:", err.message);
      socket.close();
    });
  });
}

export default connectAlchemyWS;

export function subscribeAddress(address) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("WS not ready yet for:", address);
    return;
  }

  const sub = {
    jsonrpc: "2.0",
    method: "alchemy_subscribe",
    params: [
      "alchemy_filteredAssetTransfers",
      {
        toAddress: address,
        category: ["external", "erc20"],
      },
    ],
    id: Date.now(),
  };

  subscribedAddresses.add(address.toLowerCase());
  socket.send(JSON.stringify(sub));
}
