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

const officeFormats = new Set(["doc", "docx", "docm", "odt", "rtf", "txt", "html", "htm", "md", "epub", "mobi", "azw3", "xls", "xlsx", "xlsm", "ods", "csv", "tsv", "ppt", "pptx", "pptm", "odp", "ppsx"])
const writerFormats = new Set(["doc", "docx", "docm", "odt", "rtf", "txt", "html", "htm", "md", "epub"])
const calcFormats = new Set(["xls", "xlsx", "xlsm", "ods", "csv", "tsv"])
const impressFormats = new Set(["ppt", "pptx", "pptm", "odp", "ppsx"])
const imageFormats = new Set(["jpg", "jpeg", "png", "webp", "avif", "tif", "tiff", "bmp", "gif", "heic", "heif"])
const audioFormats = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma", "aiff", "amr"])
const videoFormats = new Set(["mp4", "mov", "mkv", "avi", "webm", "mpeg", "mpg", "flv", "ogv", "wmv", "3gp"])

const officeTargets = new Map([
  ["doc", "doc"],
  ["docx", "docx"],
  ["docm", "docm:MS Word 2007 XML VBA"],
  ["odt", "odt"],
  ["rtf", "rtf"],
  ["txt", "txt:Text"],
  ["html", "html:XHTML Writer File"],
  ["htm", "html:XHTML Writer File"],
  ["md", "txt:Text"],
  ["epub", "epub"],
  ["xls", "xls"],
  ["xlsx", "xlsx"],
  ["xlsm", "xlsm:Calc MS Excel 2007 VBA XML"],
  ["ods", "ods"],
  ["csv", "csv:Text - txt - csv (StarCalc)"],
  ["tsv", "csv:Text - txt - csv (StarCalc)"],
  ["ppt", "ppt"],
  ["pptx", "pptx"],
  ["pptm", "pptm:Impress MS PowerPoint 2007 XML VBA"],
  ["odp", "odp"],
  ["ppsx", "pptx"],
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
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docm: "application/vnd.ms-word.document.macroEnabled.12",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    odp: "application/vnd.oasis.opendocument.presentation",
    epub: "application/epub+zip",
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

  if (from === to) return { path: input, name: `${base}.${to}`, format: to }

  if (imageFormats.has(from) && imageFormats.has(to)) {
    const output = path.join(workDir, `${base}.${to}`)
    let pipeline = sharp(input)
    if (["jpg", "jpeg"].includes(to)) pipeline = pipeline.jpeg({ quality: 92 })
    else if (to === "png") pipeline = pipeline.png()
    else if (to === "webp") pipeline = pipeline.webp({ quality: 92 })
    else if (to === "avif") pipeline = pipeline.avif({ quality: 85 })
    else if (["tif", "tiff"].includes(to)) pipeline = pipeline.tiff({ compression: "lzw" })
    else throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not available yet in the image engine.`)
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

  if (from === "pdf" && writerFormats.has(to)) {
    const txt = path.join(workDir, `${base}.txt`)
    await run("pdftotext", ["-layout", input, txt])
    return convertWithSoffice(txt, workDir, to, from)
  }

  if (from === "pdf" && (calcFormats.has(to) || impressFormats.has(to))) {
    const txt = path.join(workDir, `${base}.txt`)
    await run("pdftotext", ["-layout", input, txt])
    return convertWithSoffice(txt, workDir, to, from)
  }

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

  throw new Error(`${from.toUpperCase()} → ${to.toUpperCase()} is not supported by the current TraceX engine.`)
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

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "tracex-convert-"))

  try {
    const results = []
    for (const file of files) {
      const detected = ext(file.originalname)
      if (detected !== from && !(from === "jpg" && detected === "jpeg") && !(from === "tif" && detected === "tiff")) {
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
