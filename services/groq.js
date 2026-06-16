const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "mixtral-8x7b-32768"; // Free on Groq
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4096;

class GroqServiceError extends Error {
  constructor(message, { statusCode = 500, code = "GROQ_ERROR", cause } = {}) {
    super(message);
    this.name = "GroqServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.cause = cause;
  }
}

function getApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key || !key.trim()) {
    throw new GroqServiceError("AI service is not configured", {
      statusCode: 503,
      code: "AI_NOT_CONFIGURED",
    });
  }
  return key.trim();
}

function getModel() {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

function getTimeoutMs() {
  const parsed = Number(process.env.GROQ_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function parseGroqError(status, body) {
  const type = body?.error?.type || "api_error";
  const detail = body?.error?.message || "Unexpected error from AI provider";

  if (status === 401 || status === 403) {
    return new GroqServiceError("AI service authentication failed", {
      statusCode: 503,
      code: "AI_AUTH_FAILED",
    });
  }

  if (status === 429) {
    return new GroqServiceError("AI service is temporarily busy", {
      statusCode: 503,
      code: "AI_RATE_LIMITED",
    });
  }

  if (status === 400) {
    return new GroqServiceError("Invalid request to AI provider", {
      statusCode: 400,
      code: "AI_BAD_REQUEST",
      cause: detail,
    });
  }

  return new GroqServiceError("AI provider request failed", {
    statusCode: 502,
    code: type.toUpperCase(),
    cause: detail,
  });
}

/**
 * Send a message to Groq and return the assistant text response.
 *
 * @param {object} options
 * @param {string} options.system - System prompt
 * @param {string} options.userMessage - User message content
 * @param {number} [options.maxTokens] - Max output tokens
 * @returns {Promise<{ text: string, model: string, usage?: object }>}
 */
export async function sendMessage({ system, userMessage, maxTokens = DEFAULT_MAX_TOKENS }) {
  if (!system?.trim()) {
    throw new GroqServiceError("System prompt is required", {
      statusCode: 500,
      code: "INVALID_INTERNAL_REQUEST",
    });
  }

  if (!userMessage?.trim()) {
    throw new GroqServiceError("User message is required", {
      statusCode: 400,
      code: "INVALID_INPUT",
    });
  }

  const apiKey = getApiKey();
  const model = getModel();
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw parseGroqError(response.status, body);
    }

    const text = body.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      throw new GroqServiceError("AI provider returned an empty response", {
        statusCode: 502,
        code: "AI_EMPTY_RESPONSE",
      });
    }

    return {
      text,
      model: body.model || model,
      usage: body.usage,
    };
  } catch (error) {
    if (error instanceof GroqServiceError) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw new GroqServiceError("AI request timed out", {
        statusCode: 504,
        code: "AI_TIMEOUT",
      });
    }

    throw new GroqServiceError("Failed to reach AI provider", {
      statusCode: 502,
      code: "AI_NETWORK_ERROR",
      cause: error.message,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export { GroqServiceError };
