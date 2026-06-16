import { Router } from "express";
import { processNoteXRequest } from "../services/notexProcessor.js";
import { validateChatRequest } from "../middleware/validateAi.js";
import { aiRateLimiter } from "../middleware/rateLimit.js";
import { aiErrorHandler } from "../middleware/aiErrorHandler.js";

const router = Router();

router.post("/chat", aiRateLimiter, validateChatRequest, async (req, res, next) => {
  try {
    const { message, context, mode } = req.validatedChat;
    const { answer } = await processNoteXRequest({ message, context, mode });

    res.json({
      success: true,
      answer,
    });
  } catch (error) {
    next(error);
  }
});

router.use(aiErrorHandler);

export default router;
