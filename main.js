import TelegramBot from "node-telegram-bot-api";
import express from "express";
import dotenv from "dotenv";
import {
  ElectrumClient,
  ElectrumTransport,
  ElectrumCluster,
} from "electrum-cash";
import { vmNumberToBigInt, hexToBin } from "@bitauth/libauth";
import fetch from 'node-fetch';
// import axios from "axios";
import fs from "fs";
import path from "path";

dotenv.config();

const port = process.env.PORT || 4000;
const app = express();
const token = process.env.TOKEN;
const chatID = process.env.CHAT_ID;
const mintAddress = process.env.MINT_ADDR;
let formerTXID = 0;
const bot = new TelegramBot(token, { polling: true });

// Ensure that the 'tmp' folder exists, or create it if it doesn't
const tempFolderPath = path.resolve("tmp");
if (!fs.existsSync(tempFolderPath)) {
  fs.mkdirSync(tempFolderPath, { recursive: true });
}

async function downloadImage(url, outputPath) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch the image');
    }

    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);

    return new Promise((resolve, reject) => {
      dest.on('finish', () => {
        console.log(`Image saved to ${outputPath}`);
        resolve(); // resolve the promise when the download is finished
      });
      dest.on('error', (err) => {
        console.error('Error saving the image:', err);
        reject(err); // reject the promise if an error occurs
      });
    });
  } catch (error) {
    console.log("Error downloading the image:", error);
  }
}

const electrum = new ElectrumClient(
  "Electrum client example",
  "1.4.1",
  "bch.imaginary.cash",
  ElectrumTransport.WSS.Port,
  ElectrumTransport.WSS.Scheme
);
await electrum.connect();
// await electrum.ready();

async function handleNotifications() {
  let txHash = "";
  let nftName = "";
  let finalMetadata = "";
  let nftImage = "";

  try {
    const response = await electrum.request(
      "blockchain.address.get_history",
      mintAddress
    );
    const recentMints = response.slice(-1);
    txHash = recentMints[0]["tx_hash"];
    console.log("txid:", txHash);
    if (formerTXID === 0) {
      formerTXID = txHash;
      console.log("txid changed from 0");
    } else if (formerTXID !== txHash) {
      console.log("new transaction detected!!");
      const txInfoPromise = await electrum.request(
        "blockchain.transaction.get",
        txHash,
        true
      );

      const nftCommitment =
        txInfoPromise["vout"][1]["tokenData"]["nft"]["commitment"];

      let nftList = {
        commitment: nftCommitment,
        nftNumber: Number(vmNumberToBigInt(hexToBin(nftCommitment)) + 1n),
      };
      console.log(nftList);

      try {
        let BCMRlink = `https://bcmr.paytaca.com/api/tokens/1a05bce0af8b57e27b11e9429fc534d0fc27230fc541928f38b3ca945c4bca11/${nftList.commitment}/`;
        const BCMRResponse = await fetch(BCMRlink);
        const data = await BCMRResponse.json();
        nftName = data["type_metadata"]["name"];
        const nftAttr = data["type_metadata"]["extensions"]["attributes"];
        console.log(nftList.nftNumber, "minted");
        let out = new Array();
        nftImage = data["type_metadata"]["uris"]["image"].replace(
          "ipfs://",
          "https://ipfs.io/ipfs/"
        );
        console.log("nftImage: ", nftImage)
        for (let key in nftAttr) {
          if (nftAttr.hasOwnProperty(key)) {
            if (nftAttr[key] === "None" || nftAttr[key] === undefined) {
              delete nftAttr[key];
            } else {
              out.push(`- ${key}: ${nftAttr[key]} `);
            }
          }
        }

        finalMetadata = `\<code\>${out.join("\n")}\<\/code\>`;
        // console.log(finalMetadata);
      } catch (err) {
        console.log(`BCMR ERR: ${err}`);
      }
      try {
        let formattedOutput = `
${nftName} has been Minted
\<b\>\<code\>Attributes:\<\/code\>\<\/b\>
${finalMetadata}

<a href="https://explorer.salemkode.com/tx/${txHash}">Transaction ID</a>
`;

        const outputPath = path.resolve(
          tempFolderPath,
          `${nftList.nftNumber}.png`
        ); // Output path within 'a tmp' folder

        await downloadImage(nftImage, outputPath)
          .then(() =>
            console.log("Image downloaded successfully to a tmp folder")
          )
          .catch((error) => console.log("could not download image to tmp folder"));
        
        // bot.sendMessage(chatID, "im done")
          bot.sendPhoto(chatID, outputPath, {
            caption: formattedOutput,
            parse_mode: "HTML",
          })
          .then((sent) => {
            console.log("Photo sent", sent);
          })
          .catch((error) => {
            console.log("Error sending photo", error);
          });
      } catch (err) {
        console.log("TG send Err:", err);
      }
      formerTXID = txHash;
    }
  } catch (error) {
    console.log("Error fetching recent mint data");
  }
}
electrum.on("notification", () => handleNotifications());
await electrum.subscribe(`blockchain.address.subscribe`, mintAddress);

app.get("/", (req, res) => {
  res.send("Welcome to This App");
});

app.listen(port, () => {
  console.log(`server running at port ${port}`);
});
