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

const officeFormats = new Set(["docx", "txt", "html", "xlsx", "csv", "tsv", "pptx"])
const writerFormats = new Set(["docx", "txt", "html"])
const calcFormats = new Set(["xlsx", "csv", "tsv"])
const impressFormats = new Set(["pptx"])
const imageFormats = new Set(["jpg", "jpeg", "png", "webp", "avif"])
const audioFormats = new Set(["mp3", "wav", "flac", "aac", "m4a"])
const videoFormats = new Set(["mp4", "mov", "mkv", "webm"])

const conversionTargets = new Map([
  ["pdf", new Set(["docx", "txt", "html", "png", "jpg"])],
  ["docx", new Set(["pdf", "txt", "html"])],
  ["txt", new Set(["pdf", "docx", "html"])],
  ["html", new Set(["pdf", "docx", "txt"])],
  ["pptx", new Set(["pdf"])],
  ["xlsx", new Set(["pdf", "csv", "tsv"])],
  ["csv", new Set(["pdf", "xlsx", "tsv"])],
  ["tsv", new Set(["pdf", "xlsx", "csv"])],
  ["jpg", new Set(["png", "webp", "avif"])],
  ["jpeg", new Set(["png", "webp", "avif"])],
  ["png", new Set(["jpg", "webp", "avif"])],
  ["webp", new Set(["jpg", "png", "avif"])],
  ["avif", new Set(["jpg", "png", "webp"])],
  ["mp3", new Set(["wav", "m4a", "flac", "aac"])],
  ["wav", new Set(["mp3", "m4a", "flac", "aac"])],
  ["m4a", new Set(["mp3", "wav", "flac", "aac"])],
  ["flac", new Set(["mp3", "wav", "m4a", "aac"])],
  ["aac", new Set(["mp3", "wav", "m4a", "flac"])],
  ["mp4", new Set(["mov", "mkv", "webm", "mp3", "wav", "m4a", "flac", "aac"])],
  ["mov", new Set(["mp4", "mkv", "webm", "mp3", "wav", "m4a", "flac", "aac"])],
  ["mkv", new Set(["mp4", "mov", "webm", "mp3", "wav", "m4a", "flac", "aac"])],
  ["webm", new Set(["mp4", "mov", "mkv", "mp3", "wav", "m4a", "flac", "aac"])],
])

const officeTargets = new Map([
  ["docx", "docx"],
  ["txt", "txt:Text"],
  ["html", "html:XHTML Writer File"],
  ["xlsx", "xlsx"],
  ["csv", "csv:Text - txt - csv (StarCalc)"],
  ["tsv", "csv:Text - txt - csv (StarCalc)"],
  ["pptx", "pptx"],
  ["pdf", "pdf:writer_pdf_Export"],
])

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
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
    zip: "application/zip",
  }
  return map[format] || "application/octet-stream"
}

function supportedConversion(from, to) {
  return conversionTargets.get(from)?.has(to) || false
}

async function convertWithSoffice(input, outDir, to, sourceFormat) {
  const target = officeTargets.get(to)
  if (!target) throw new Error(`${sourceFormat.toUpperCase()} → ${to.toUpperCase()} is not available in the document engine.`)
  const before = new Set(await fs.readdir(outDir))
  await run("soffice", ["--headless", "--convert-to", target, "--outdir", outDir, input], { maxBuffer: 16 * 1024 * 1024 })
  const after = await fs.readdir(outDir)
  const created = after.filter((name) => !before.has(name) && name !== path.basename(input))
  const expectedExt = to === "htm" ? "html" : to
  const exact = created.find((name) => path.extname(name).slice(1).toLowerCase() === expectedExt)
  const outputName = exact || created[0]
  if (!outputName) throw new Error(`${sourceFormat.toUpperCase()} → ${to.toUpperCase()} failed.`)
  return { path: path.join(outDir, outputName), name: outputName, format: to }
}

async function convertOne(file, from, to, workDir) {
  const inputName = safeName(file.originalname)
  const input = path.join(workDir, inputName)
  await fs.writeFile(input, file.buffer)
  const base = path.basename(inputName, path.extname(inputName))

  if (from === to) throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not a conversion.`)
  if (!supportedConversion(from, to)) throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not a supported TraceX conversion.`)

  if (imageFormats.has(from) && imageFormats.has(to)) {
    const output = path.join(workDir, `${base}.${to}`)
    let pipeline = sharp(input)
    if (["jpg", "jpeg"].includes(to)) pipeline = pipeline.jpeg({ quality: 92 })
    else if (to === "png") pipeline = pipeline.png()
    else if (to === "webp") pipeline = pipeline.webp({ quality: 92 })
    else if (to === "avif") pipeline = pipeline.avif({ quality: 85 })
    else throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not available in the image engine.`)
    await pipeline.toFile(output)
    return { path: output, name: `${base}.${to}`, format: to }
  }

  if (from === "pdf" && to === "txt") {
    const output = path.join(workDir, `${base}.txt`)
    await run("pdftotext", ["-layout", input, output])
    return { path: output, name: `${base}.txt`, format: "txt" }
  }

  if (from === "pdf" && ["png", "jpg"].includes(to)) {
    const prefix = path.join(workDir, `${base}-page`)
    const args = [to === "jpg" ? "-jpeg" : "-png", "-r", "150", input, prefix]
    await run("pdftoppm", args)
    const files = (await fs.readdir(workDir)).filter((name) => name.startsWith(`${base}-page-`)).sort()
    if (files.length === 1) return { path: path.join(workDir, files[0]), name: `${base}.${to}`, format: to }
    return { paths: files.map((name) => path.join(workDir, name)), archive: true, name: `${base}-pages.zip`, format: "zip" }
  }

  if (from === "pdf" && writerFormats.has(to)) {
    const txt = path.join(workDir, `${base}.txt`)
    await run("pdftotext", ["-layout", input, txt])
    return convertWithSoffice(txt, workDir, to, from)
  }

  if (from === "office-placeholder") return null

  if (officeFormats.has(from) && to === "pdf") return convertWithSoffice(input, workDir, "pdf", from)

  if (officeFormats.has(from) && officeFormats.has(to)) return convertWithSoffice(input, workDir, to, from)

  if (videoFormats.has(from) && (videoFormats.has(to) || audioFormats.has(to))) {
    const output = path.join(workDir, `${base}.${to}`)
    await run("ffmpeg", ["-y", "-i", input, output], { maxBuffer: 16 * 1024 * 1024 })
    return { path: output, name: `${base}.${to}`, format: to }
  }

  if (audioFormats.has(from) && audioFormats.has(to)) {
    const output = path.join(workDir, `${base}.${to}`)
    await run("ffmpeg", ["-y", "-i", input, output], { maxBuffer: 16 * 1024 * 1024 })
    return { path: output, name: `${base}.${to}`, format: to }
  }

  throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not available in the current TraceX engine.`)
}

async function zipFiles(files, target) {
  const names = files.map((file) => file.name)
  await run("zip", ["-j", target, ...names], { cwd: path.dirname(files[0].path), maxBuffer: 16 * 1024 * 1024 })
  return target
}

router.post("/", upload.array("files", 10), async (req, res) => {
  const from = String(req.body.from || "").toLowerCase()
  const to = String(req.body.to || "").toLowerCase()
  const files = req.files || []

  if (!from || !to) return res.status(400).json({ error: "Missing source or destination format." })
  if (!files.length) return res.status(400).json({ error: "No files were uploaded." })
  if (!supportedConversion(from, to)) return res.status(422).json({ error: `${from.toUpperCase()} → ${to.toUpperCase()} is not a supported TraceX conversion.` })

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "tracex-convert-"))

  try {
    const results = []
    for (const file of files) {
      const detected = ext(file.originalname)
      if (detected !== from && !(from === "jpg" && detected === "jpeg")) {
        throw new Error(`${file.originalname} does not match the selected input format ${from.toUpperCase()}.`)
      }
      results.push(await convertOne(file, from, to, workDir))
    }

    const expanded = []
    for (const result of results) {
      if (result.archive) {
        for (const item of result.paths) expanded.push({ path: item, name: path.basename(item) })
      } else expanded.push({ path: result.path, name: result.name })
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
    res.send(await fs.readFile(outputPath))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversion failed."
    res.status(422).json({ error: message })
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

export default router
