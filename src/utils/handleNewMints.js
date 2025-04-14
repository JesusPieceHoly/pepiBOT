// src/utils/handleNewMints.js
import path from "path";
import fetch from "node-fetch";
import { vmNumberToBigInt, hexToBin } from "@bitauth/libauth";
import { downloadImage } from "./downloadImage.js";

export async function handleNewMints(
  electrum,
  bot,
  chatID,
  mintAddress,
  quantityMinted,
  tempFolderPath
) {
  const response = await electrum.request(
    "blockchain.address.get_history",
    mintAddress
  );
  const recentMints = response.slice(-quantityMinted);

  // Create an array of async tasks
  const mintTasks = recentMints.map(async (tx) => {
    try {
      const txHash = tx.tx_hash;
      const txInfo = await electrum.request(
        "blockchain.transaction.get",
        txHash,
        true
      );
      const nftCommitment = txInfo.vout[1].tokenData.nft.commitment;
      const nftNumber = Number(vmNumberToBigInt(hexToBin(nftCommitment)) + 1n);

      const BCMRlink = `https://bcmr.paytaca.com/api/tokens/1a05bce0af8b57e27b11e9429fc534d0fc27230fc541928f38b3ca945c4bca11/${nftCommitment}/`;
      const BCMRResponse = await fetch(BCMRlink);
      const data = await BCMRResponse.json();

      const nftName = data.type_metadata.name;
      const attributes = data.type_metadata.extensions.attributes;
      const nftImage = data.type_metadata.uris.image.replace(
        "ipfs://",
        "https://ipfs.io/ipfs/"
      );

      const attrStr = Object.entries(attributes || {})
        .filter(([_, value]) => value && value !== "None")
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");

      const finalMetadata = `<code>${attrStr}</code>`;
      const outputPath = path.resolve(tempFolderPath, `${nftNumber}.png`);

      await downloadImage(nftImage, outputPath);

      const formattedOutput = `
${nftName} has been Minted
<b><code>Attributes:</code></b>
${finalMetadata}

<a href="https://explorer.salemkode.com/tx/${txHash}">Transaction ID</a>
      `;

      await bot.sendPhoto(chatID, outputPath, {
        caption: formattedOutput,
        parse_mode: "HTML",
      });

      console.log(`Sent NFT #${nftNumber}`);
    } catch (err) {
      console.error("Error processing mint: ", err);
    }
  });

  // Execute all tasks in parallel
  await Promise.all(mintTasks);
}
