import fs from "fs";
import fetch from "node-fetch";

export async function downloadImage(url, outputPath) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch the image");

    const dest = fs.createWriteStream(outputPath);
    response.body.pipe(dest);

    return new Promise((resolve, reject) => {
      dest.on("finish", () => resolve());
      dest.on("error", (err) => reject(err));
    });
  } catch (error) {
    console.error("Image download error:", error);
    throw error;
  }
}
