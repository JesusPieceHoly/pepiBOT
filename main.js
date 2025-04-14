// index.js
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import dotenv from "dotenv";
import { ElectrumClient, ElectrumTransport } from "electrum-cash";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { handleNewMints } from "./src/utils/handleNewMints.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const token = process.env.TOKEN;
const chatID = process.env.CHAT_ID;
const mintAddress = process.env.MINT_ADDR;
// const apiUrl = "http://localhost:3000/api/status";
const apiUrl = "https://api.pepi.cash/";

const tempFolderPath = path.resolve("tmp");
if (!fs.existsSync(tempFolderPath)) {
  fs.mkdirSync(tempFolderPath, { recursive: true });
}

const bot = new TelegramBot(token, { polling: true });

const electrum = new ElectrumClient(
  "Electrum client",
  "1.4.1",
  "bch.imaginary.cash",
  ElectrumTransport.WSS.Port,
  ElectrumTransport.WSS.Scheme
);

let previousMinted = null;
let isWaiting = false;
let hasInitialized = false;

await electrum.connect();

async function handleNotifications() {
  if (isWaiting) return;
  isWaiting = true;

  let tries = 0;
  while (tries < 10) {
    try {
      const res = await fetch(apiUrl);
      const data = await res.json();

      if (previousMinted === null) {
        previousMinted = data.nftsMinted;
        console.log(`Initial value set: nftsMinted = ${previousMinted}`);
        break; // Only initialize on first start
      }

      if (data.nftsMinted > previousMinted) {
        console.log("Change detected on mint address");

        const diff = data.nftsMinted - previousMinted;
        previousMinted = data.nftsMinted;
        console.log(`${diff} new NFTs detected.`);
        await handleNewMints(
          electrum,
          bot,
          chatID,
          mintAddress,
          diff,
          tempFolderPath
        );
        break;
      }
    } catch (err) {
      console.error("Error checking API:", err);
    }
    tries++;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  isWaiting = false;
}

electrum.on("notification", () => handleNotifications());
await electrum.subscribe("blockchain.address.subscribe", mintAddress);

app.get("/", (req, res) => {
  res.send("Welcome to This App");
});

app.listen(port, () => {
  console.log(`Server running at port ${port}`);
});
