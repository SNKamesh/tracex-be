import { ClaudeServiceError } from "../services/claude.js";

export function aiErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ClaudeServiceError) {
    const payload = {
      success: false,
      error: err.message,
      code: err.code,
    };

    if (process.env.NODE_ENV !== "production" && err.cause) {
      payload.details = err.cause;
    }

    return res.status(err.statusCode).json(payload);
  }

  console.error("[AI] Unhandled error:", err);

  return res.status(500).json({
    success: false,
    error: "An unexpected error occurred while processing your request.",
  });
}
