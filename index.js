import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import admin from "firebase-admin";
import multer from "multer";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Configure local temporary file upload directory
const upload = multer({ dest: "uploads/" });

// ---- Firebase Admin Initialization ----
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      admin.initializeApp();
    }
  } catch (err) {
    console.error("Failed to initialize Firebase Admin:", err);
  }
}

// ---- Cloudflare R2 Storage Client Setup ----
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

// ---- Base / Health Check Endpoints ----
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "tracex-be" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// ---- Core Feature: PDF Compression API ----
app.post("/compress", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No PDF file uploaded" });
  }

  // Fallback to medium if level parameter is missing or incorrect
  const level = req.body.level || "medium";
  
  // Map our simple UI levels to system-level Ghostscript configurations
  const gsSettings = {
    low: "/printer",
    medium: "/ebook",
    high: "/screen",
  };

  const selectedSetting = gsSettings[level] || "/ebook";
  const inputPath = req.file.path;
  const outputFilename = `compressed_${level}_${Date.now()}_${req.file.originalname}`;
  const outputPath = path.join("uploads", outputFilename);

  try {
    // Execute native system Ghostscript binary to handle native compression routines
    await execFileAsync("gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${selectedSetting}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outputPath}`,
      inputPath,
    ]);

    // Read the optimized compressed file data into a memory buffer
    const fileBuffer = fs.readFileSync(outputPath);

    // Upload the final asset directly to your Cloudflare R2 bucket storage architecture
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: `conversions/${outputFilename}`,
        Body: fileBuffer,
        ContentType: "application/pdf",
        ContentDisposition: `attachment; filename="${req.file.originalname}"`,
      })
    );

    // Calculate real sizes dynamically to display accurate metrics onto the frontend UI
    const originalSize = req.file.size;
    const compressedSize = fs.statSync(outputPath).size;

    // Construct the public storage resolution asset link
    // Formatted as: https://pub-<id>.r2.dev/conversions/filename.pdf or using a custom domain
    const downloadUrl = `${process.env.R2_PUBLIC_URL_PREFIX}/conversions/${outputFilename}`;

    res.json({
      success: true,
      url: downloadUrl,
      filename: req.file.originalname.replace(/\.pdf$/i, "") + "_compressed.pdf",
      metrics: {
        originalSizeKB: parseFloat((originalSize / 1024).toFixed(1)),
        compressedSizeKB: parseFloat((compressedSize / 1024).toFixed(1)),
        savingsPercentage: parseFloat((((originalSize - compressedSize) / originalSize) * 100).toFixed(1)),
      }
    });

  } catch (error) {
    console.error("Ghostscript compression failed:", error);
    res.status(500).json({ error: "Server error executing document compression metrics process" });
  } finally {
    // Housekeeping: Always purge file residuals out of the disk allocation table to save server space
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running smoothly on port ${PORT}`);
});