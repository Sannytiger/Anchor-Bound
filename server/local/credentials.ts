import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Express } from "express";
import { credentialRecords, type CredentialRecord, type InsertCredentialRecord } from "../../drizzle/schema";
import { getDb } from "../db";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x36612712B622625B40Abe20af59cE831BbaAe536";
const NETWORK = process.env.BLOCKCHAIN_NETWORK || "Polygon Amoy";
const DB_UNAVAILABLE_ERROR = "Database is not configured. Set DATABASE_URL on the server.";
const FIRST_TOKEN_ID = 1042;

function nextTokenId(records: CredentialRecord[]) {
  return records.length ? Math.max(...records.map((item) => item.tokenId)) + 1 : FIRST_TOKEN_ID;
}

export function registerCredentialRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", network: NETWORK, contract: CONTRACT_ADDRESS, blockchainConfigured: Boolean(process.env.PRIVATE_KEY && process.env.ALCHEMY_RPC_URL) });
  });

  app.get("/api/verify/:query", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: DB_UNAVAILABLE_ERROR });

    const clean = decodeURIComponent(String(req.params.query ?? "")).trim().toLowerCase();
    const records = await db.select().from(credentialRecords);
    const numeric = Number(clean.replace(/^#/, ""));
    const record = records.find((item) => String(item.tokenId) === clean.replace(/^#/, "") || (!Number.isNaN(numeric) && item.tokenId === numeric) || item.fileHash.toLowerCase() === clean || item.recipientAddress.toLowerCase() === clean);
    if (!record) return res.status(404).json({ valid: false, error: "Credential not found in the local verification registry." });
    return res.json({ valid: true, tokenId: `#${record.tokenId}`, recipientName: record.recipientName, documentTitle: record.documentTitle, issuerName: record.issuerName, ownerAddress: record.recipientAddress, fileHash: record.fileHash, metadata: record.metadata, tokenURI: record.tokenURI, issuedAt: record.issuedAt });
  });

  app.get("/api/portfolio/:recipient", async (req, res) => {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: DB_UNAVAILABLE_ERROR });

    const clean = decodeURIComponent(String(req.params.recipient ?? "")).trim().toLowerCase();
    const records = (await db.select().from(credentialRecords)).filter((record) => record.recipientName.toLowerCase() === clean || record.recipientAddress.toLowerCase() === clean);
    res.json({ records });
  });

  app.get("/api/registry", async (_req, res) => {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: DB_UNAVAILABLE_ERROR });

    const records = await db.select().from(credentialRecords);
    res.json({ contractAddress: CONTRACT_ADDRESS, issuers: [{ name: "Anchor Bound Demo Registry", issuedCount: records.length, status: "Active" }] });
  });

  app.post("/api/issue", async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!body.recipientAddress || !body.recipientName || !body.documentTitle || !body.fileHash) return res.status(400).json({ error: "Recipient address, name, document title, and file hash are required." });
      if (!/^0x[a-fA-F0-9]{40}$/.test(String(body.recipientAddress))) return res.status(400).json({ error: "Invalid wallet address." });

      const db = await getDb();
      if (!db) return res.status(503).json({ error: DB_UNAVAILABLE_ERROR });

      const metadata = { name: `${body.documentTitle} - ${body.recipientName}`, description: `Anchor Bound credential issued by ${body.issuerName || "Verified Issuer"}`, attributes: [{ trait_type: "Student", value: body.recipientName }, { trait_type: "Degree", value: body.documentTitle }, { trait_type: "Issuer", value: body.issuerName || "Verified Issuer" }, { trait_type: "SHA256 Hash", value: body.fileHash }, { trait_type: "Soulbound", value: true }] };
      const existingRecords = await db.select().from(credentialRecords);

      if (process.env.PRIVATE_KEY && process.env.ALCHEMY_RPC_URL && process.env.PINATA_JWT) {
        const [{ ethers }, { PinataSDK }] = await Promise.all([import("ethers"), import("pinata")]);
        const pinata = new PinataSDK({ pinataJwt: process.env.PINATA_JWT });
        const upload = await pinata.upload.public.json(metadata);
        const ipfsUri = `ipfs://${upload.cid}`;
        const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_RPC_URL);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const abi = ["function issueCredential(address studentAddress, string memory tokenURI) public returns (uint256)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
        const tx = await contract.issueCredential(String(body.recipientAddress), ipfsUri);
        const receipt = await tx.wait();
        const event = receipt?.logs?.find((log: any) => typeof log?.args?.[0] !== "undefined");
        const tokenId = event?.args?.[0] ? Number(event.args[0]) : nextTokenId(existingRecords);
        const values: InsertCredentialRecord = { tokenId, recipientAddress: String(body.recipientAddress), recipientName: String(body.recipientName), documentTitle: String(body.documentTitle), issuerName: String(body.issuerName || "Verified Issuer"), template: String(body.template || "archive"), fileHash: String(body.fileHash), tokenURI: ipfsUri, txHash: tx.hash, metadata };
        await db.insert(credentialRecords).values(values);
        const [record] = await db.select().from(credentialRecords).where(eq(credentialRecords.tokenId, values.tokenId)).limit(1);
        return res.status(201).json({ success: true, tokenId: values.tokenId, transactionHash: tx.hash, ipfsUri, record, localOnly: false });
      }

      const tokenId = nextTokenId(existingRecords);
      const txHash = `0x${crypto.createHash("sha256").update(`${body.recipientAddress}:${body.fileHash}:${Date.now()}`).digest("hex")}`;
      const tokenURI = `anchor-bound://local/${tokenId}`;
      const values: InsertCredentialRecord = { tokenId, recipientAddress: String(body.recipientAddress), recipientName: String(body.recipientName), documentTitle: String(body.documentTitle), issuerName: String(body.issuerName || "Verified Issuer"), template: String(body.template || "archive"), fileHash: String(body.fileHash), tokenURI, txHash, metadata };
      await db.insert(credentialRecords).values(values);
      const [record] = await db.select().from(credentialRecords).where(eq(credentialRecords.tokenId, tokenId)).limit(1);
      return res.status(201).json({ success: true, tokenId, transactionHash: txHash, ipfsUri: tokenURI, record, localOnly: true });
    } catch (error) {
      console.error("[Credential] issue failed", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "Credential issuance failed." });
    }
  });
}
