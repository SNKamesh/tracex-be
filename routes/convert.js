import express from "express"
import multer from "multer"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import sharp from "sharp"

const router = express.Router()
const run = promisify(execFile)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 10 } })

const officeFormats = new Set(["doc", "docx", "docm", "odt", "rtf", "txt", "html", "htm", "xls", "xlsx", "xlsm", "ods", "csv", "tsv", "ppt", "pptx", "pptm", "odp", "ppsx"])
const imageFormats = new Set(["jpg", "jpeg", "png", "webp", "avif", "tif", "tiff", "bmp", "gif", "heic", "heif"])
const audioFormats = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "amr"])
const videoFormats = new Set(["mp4", "mov", "mkv", "avi", "webm", "mpeg", "mpg", "flv", "ogv", "wmv", "3gp"])

function ext(name) {
  return path.extname(name).slice(1).toLowerCase()
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_")
}

function mimeFor(format) {
  const map = {
    pdf: "application/pdf",
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
    zip: "application/zip",
  }
  return map[format] || "application/octet-stream"
}

async function outputFromSoffice(input, outDir, target) {
  await run("soffice", ["--headless", "--convert-to", target, "--outdir", outDir, input], { maxBuffer: 1024 * 1024 * 8 })
  const files = await fs.readdir(outDir)
  return files.find((file) => file !== path.basename(input))
}

async function convertOne(file, from, to, workDir) {
  const inputName = safeName(file.originalname)
  const input = path.join(workDir, inputName)
  await fs.writeFile(input, file.buffer)

  const base = path.basename(inputName, path.extname(inputName))

  if (from === to) {
    return { path: input, name: `${base}.${to}`, format: to }
  }

  if (imageFormats.has(from) && imageFormats.has(to)) {
    const output = path.join(workDir, `${base}.${to}`)
    let pipeline = sharp(input)
    if (["jpg", "jpeg"].includes(to)) pipeline = pipeline.jpeg({ quality: 92 })
    else if (to === "png") pipeline = pipeline.png()
    else if (to === "webp") pipeline = pipeline.webp({ quality: 92 })
    else if (to === "avif") pipeline = pipeline.avif({ quality: 85 })
    else if (["tif", "tiff"].includes(to)) pipeline = pipeline.tiff({ compression: "lzw" })
    else if (to === "gif") throw new Error("GIF output is not available in the image engine yet.")
    else if (to === "bmp") throw new Error("BMP output is not available in the image engine yet.")
    else throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not available yet.`)
    await pipeline.toFile(output)
    return { path: output, name: `${base}.${to}`, format: to }
  }

  if (from === "pdf" && to === "txt") {
    const output = path.join(workDir, `${base}.txt`)
    await run("pdftotext", ["-layout", input, output])
    return { path: output, name: `${base}.txt`, format: "txt" }
  }

  if (from === "pdf" && ["png", "jpg", "jpeg"].includes(to)) {
    const prefix = path.join(workDir, `${base}-page`)
    const args = ["-png", "-r", "150", input, prefix]
    if (["jpg", "jpeg"].includes(to)) args[0] = "-jpeg"
    await run("pdftoppm", args)
    const files = (await fs.readdir(workDir)).filter((name) => name.startsWith(`${base}-page-`)).sort()
    if (files.length === 1) return { path: path.join(workDir, files[0]), name: `${base}.${to}`, format: to }
    return { paths: files.map((name) => path.join(workDir, name)), archive: true, name: `${base}-pages.zip`, format: "zip" }
  }

  if (videoFormats.has(from) && (videoFormats.has(to) || audioFormats.has(to))) {
    const output = path.join(workDir, `${base}.${to}`)
    await run("ffmpeg", ["-y", "-i", input, output], { maxBuffer: 1024 * 1024 * 8 })
    return { path: output, name: `${base}.${to}`, format: to }
  }

  if (audioFormats.has(from) && audioFormats.has(to)) {
    const output = path.join(workDir, `${base}.${to}`)
    await run("ffmpeg", ["-y", "-i", input, output], { maxBuffer: 1024 * 1024 * 8 })
    return { path: output, name: `${base}.${to}`, format: to }
  }

  if ((officeFormats.has(from) || ["pdf"].includes(from)) && officeFormats.has(to)) {
    if (from === "pdf") {
      const txt = path.join(workDir, `${base}.txt`)
      await run("pdftotext", ["-layout", input, txt])
      if (to === "txt") return { path: txt, name: `${base}.txt`, format: "txt" }
      await outputFromSoffice(txt, workDir, to)
      const files = await fs.readdir(workDir)
      const outputName = files.find((name) => name !== inputName && name !== path.basename(txt))
      if (!outputName) throw new Error(`PDF → ${to.toUpperCase()} failed.`)
      return { path: path.join(workDir, outputName), name: outputName, format: to }
    }
    const target = to === "html" || to === "htm" ? "html" : to
    const outputName = await outputFromSoffice(input, workDir, target)
    if (!outputName) throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} failed.`)
    return { path: path.join(workDir, outputName), name: outputName, format: to }
  }

  if (from === "pdf" && to === "pdf") return { path: input, name: `${base}.pdf`, format: "pdf" }

  throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not supported by the current TraceX engine.`)
}

async function zipFiles(files, target) {
  const names = files.map((file) => file.name)
  await run("zip", ["-j", target, ...names], { cwd: path.dirname(files[0].path), maxBuffer: 1024 * 1024 * 8 })
  return target
}

router.post("/", upload.array("files", 10), async (req, res) => {
  const from = String(req.body.from || "").toLowerCase()
  const to = String(req.body.to || "").toLowerCase()
  const files = req.files || []

  if (!from || !to) return res.status(400).json({ error: "Missing source or destination format." })
  if (!files.length) return res.status(400).json({ error: "No files were uploaded." })

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "tracex-convert-"))

  try {
    const results = []
    for (const file of files) {
      const detected = ext(file.originalname)
      if (detected !== from) throw new Error(`${file.originalname} does not match the selected input format ${from.toUpperCase()}.`)
      results.push(await convertOne(file, from, to, workDir))
    }

    const expanded = []
    for (const result of results) {
      if (result.archive) {
        for (const item of result.paths) expanded.push({ path: item, name: path.basename(item) })
      } else {
        expanded.push({ path: result.path, name: result.name })
      }
    }

    let outputPath
    let outputName
    let outputFormat

    if (expanded.length === 1) {
      outputPath = expanded[0].path
      outputName = expanded[0].name
      outputFormat = to
    } else {
      outputName = `${safeName(path.basename(files[0].originalname, path.extname(files[0].originalname)))}-${to}-files.zip`
      outputPath = path.join(workDir, outputName)
      await zipFiles(expanded, outputPath)
      outputFormat = "zip"
    }

    res.setHeader("Content-Type", mimeFor(outputFormat))
    res.setHeader("Content-Disposition", `attachment; filename="${outputName}"`)
    const data = await fs.readFile(outputPath)
    res.send(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversion failed."
    res.status(422).json({ error: message })
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

export default router
