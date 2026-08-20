import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import morgan from "morgan"
import admin from "firebase-admin"
import aiRoutes from "./routes/ai.js"
import sessionRoutes from "./routes/sessions.js"
import convertRoutes from "./routes/convert.js"
import rateLimit from "./middleware/rateLimit.js"
import aiErrorHandler from "./middleware/aiErrorHandler.js"

dotenv.config()

const app = express()

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  })
}

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
)

app.use(express.json({ limit: "20mb" }))
app.use(morgan("dev"))
app.use(rateLimit)

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "TraceX API",
    version: "1.0.0",
  })
})

app.use("/api/ai", aiRoutes)
app.use("/api/sessions", sessionRoutes)
app.use("/api/convert", convertRoutes)
app.use(aiErrorHandler)

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`TraceX backend running on ${PORT}`)
})
