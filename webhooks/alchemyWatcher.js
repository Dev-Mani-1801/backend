// ws/alchemyWatcher.js
import WebSocket from "ws";
import WalletAddress from "../models/WalletAddress.js";

// const ALCHEMY_WS_URL = process.env.ALCHEMY_WSS_URL;
const ALCHEMY_WS_URL = 'wss://bnb-mainnet.g.alchemy.com/v2/j5Gu8NRwY7FwupLnzayLE';

let socket;

export async function connectAlchemyWS() {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(ALCHEMY_WS_URL);

    socket.on("open", () => {
      console.log("Connected to Alchemy WS");
      resolve(socket);
    });

    socket.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg?.params?.result) {
          const tx = msg.params.result;
          const to = tx.to?.toLowerCase();

          if (to) {
            const wallet = await WalletAddress.findOne({ address: to });
            if (wallet) {
              console.log(`Deposit detected for user ${wallet.userId}:`, tx);

              // TODO: update user balance in DB here
              // Example:
              // await UserWallet.updateOne(
              //   { userId: wallet.userId, asset: wallet.asset },
              //   { $inc: { balance: Number(tx.value) / 1e18 } }
              // );
            }
          }
        }
      } catch (err) {
        console.error("Error handling WS message:", err);
      }
    });

    socket.on("close", () => {
        console.log("API KEY: ", ALCHEMY_WS_URL)
      console.log("WS closed, reconnecting in 5s...");
      setTimeout(() => connectAlchemyWS().catch(console.error), 5000);
    });

    socket.on("error", (err) => {
      console.error("WS error:", err.message);
      socket.close();
    });
  });
}

export function subscribeAddress(address) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("WS not connected yet, cannot subscribe");
    return;
  }

  const sub = {
    jsonrpc: "2.0",
    method: "eth_subscribe",
    params: [
      "alchemy_minedTransactions",
      {
        addresses: [{ to: address }],
        includeRemoved: false,
        hashesOnly: false,
      },
    ],
    id: Date.now(),
  };

  socket.send(JSON.stringify(sub));
}

export default connectAlchemyWS;
