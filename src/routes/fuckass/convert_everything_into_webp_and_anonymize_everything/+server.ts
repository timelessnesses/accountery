import type { Transaction } from "$lib/types/AccountingDatabaseTypes";
import { error } from "@sveltejs/kit";

export const GET = async ({ params, platform, locals }) => { 
    const shit = await platform?.env.AccountingDatabase.prepare("SELECT * FROM transactions").all<Transaction>();
    if (!shit) {
        error(404, "No transactions found");
    }
    if (!platform) {
        error(500, "mf where am I??? take me back to cloudflare");
    }
    const queriesForBatch = []
    for (const transaction of shit.results) {
        let filename = transaction.image;
        if (transaction.image.includes("@tsu.ac.th")) {
            filename = `/api/payments/${crypto.randomUUID()}`;
            queriesForBatch.push(
                platform?.env.AccountingDatabase.prepare("UPDATE transactions SET image = ? WHERE id = ?").bind(filename, transaction.id)
            );
        }
        const stripped = transaction.image.replace("/api/payments/", "");
        const image = await platform?.env.AccountingReceipts.get(stripped);
        if (!image) { 
            console.error(`Image not found for transaction ID ${transaction.id} with filename ${stripped}`);
            continue;
        }
        const isAlreadyWebP = image.httpMetadata?.contentType === "image/webp";
        if (isAlreadyWebP) {
            console.log(`Image for transaction ID ${transaction.id} with filename ${stripped} is already in WebP format`);
            continue;
        }
        const webpified = await platform?.env.CloudflareImageManipulator5000.input(image.body).output({
            format: "image/webp",
        }).then((output) => output.response().arrayBuffer());
        if (!webpified) {
            console.error(`Failed to convert image to WebP for transaction ID ${transaction.id} with filename ${stripped}`);
            continue;
        }
        await platform?.env.AccountingReceipts.put(stripped, webpified);
    }
    await platform?.env.AccountingDatabase.batch(queriesForBatch);
}