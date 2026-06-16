import { NOTEX_MODES } from "../services/notexProcessor.js";

const MAX_MESSAGE_LENGTH = 8_000;
const MAX_CONTEXT_LENGTH = 100_000;

export function validateChatRequest(req, res, next) {
  const { message, context, mode } = req.body ?? {};

  const errors = [];

  if (typeof message !== "string" || !message.trim()) {
    errors.push("message is required and must be a non-empty string");
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.push(`message must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  if (context !== undefined && context !== null && typeof context !== "string") {
    errors.push("context must be a string when provided");
  } else if (typeof context === "string" && context.length > MAX_CONTEXT_LENGTH) {
    errors.push(`context must be at most ${MAX_CONTEXT_LENGTH} characters`);
  }

  if (typeof mode !== "string" || !mode.trim()) {
    errors.push("mode is required and must be a string");
  } else if (!NOTEX_MODES.includes(mode.trim().toLowerCase())) {
    errors.push(`mode must be one of: ${NOTEX_MODES.join(", ")}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: errors,
    });
  }

  req.validatedChat = {
    message: message.trim(),
    context: typeof context === "string" ? context.trim() : "",
    mode: mode.trim().toLowerCase(),
  };

  next();
}
