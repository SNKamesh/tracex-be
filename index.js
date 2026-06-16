import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import aiRouter from "./routes/ai.js";

const execFileAsync = promisify(execFile);

const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const app = express();
app.use(cors(corsOptions));
app.use(morgan("dev"));

// AI routes need a larger JSON payload limit for note context
app.use("/api/ai", express.json({ limit: "512kb" }), aiRouter);

app.use(express.json({ limit: "100kb" }));

// Using absolute workspace paths to ensure flawless Docker file system execution
const __dirname = path.resolve();
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "public", "downloads");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Expose the public downloads folder so users can fetch files straight over the web
app.use("/downloads", express.static(outputDir));

const upload = multer({ dest: "uploads/" });

// Base Health check endpoints
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "tracex-be" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// ── Feature 1: PDF Compression API (Strict Local Storage) ─────────────────────
app.post("/compress", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No PDF file uploaded" });
  }

  const level = req.body.level || "medium";
  const gsSettings = {
    low: "/printer",
    medium: "/ebook",
    high: "/screen",
  };

  const selectedSetting = gsSettings[level] || "/ebook";
  const inputPath = req.file.path;
  const outputFilename = `compressed_${level}_${Date.now()}_${req.file.originalname}`;
  const outputPath = path.join(outputDir, outputFilename);

  try {
    // Run system-level Ghostscript optimization directly inside your container
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

    // Calculate structural storage size differentials
    const originalSize = req.file.size;
    const compressedSize = fs.statSync(outputPath).size;

    // Dynamically build the cloud address mapping back to your custom Render domain
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.get("host");
    const downloadUrl = `${protocol}://${host}/downloads/${outputFilename}`;

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
    res.status(500).json({ error: "Server error executing document compression process" });
  } finally {
    // Clean up original upload cache file promptly to save disk limits
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
});

// ── Feature 2: Image Conversion API (Sharp Optimization Engine) ───────────────
app.post("/convert-image", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded" });
  }

  const targetFormat = req.body.format || "jpeg"; 
  const inputPath = req.file.path;
  
  const baseName = req.file.originalname.replace(/\.[^/.]+$/, "");
  const outputFilename = `converted_${Date.now()}_${baseName}.${targetFormat}`;
  const outputPath = path.join(outputDir, outputFilename);

  try {
    const { default: sharp } = await import("sharp");

    // Process re-encoding inside server memory efficiently
    await sharp(inputPath)
      .toFormat(targetFormat, { quality: 90 })
      .toFile(outputPath);

    // Dynamically build file mapping link pointing back to your Render domain
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.get("host");
    const downloadUrl = `${protocol}://${host}/downloads/${outputFilename}`;

    res.json({
      success: true,
      url: downloadUrl,
      filename: `${baseName}.${targetFormat}`,
    });
  } catch (error) {
    console.error("Image conversion failed:", error);
    res.status(500).json({ error: "Our transformation engines couldn't process this image layout." });
  } finally {
    // Purge original file upload cache instantly
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
});

// Automatic Disk Cleanup Routine: Purges downloads older than 30 minutes every quarter-hour
setInterval(() => {
  fs.readdir(outputDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && now - stats.mtimeMs > 30 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 15 * 1000 * 60);

app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Request body exceeds the allowed size limit.",
    });
  }
  next(err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running smoothly on port ${PORT}`);
});