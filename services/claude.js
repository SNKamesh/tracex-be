const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4096;

class ClaudeServiceError extends Error {
  constructor(message, { statusCode = 500, code = "CLAUDE_ERROR", cause } = {}) {
    super(message);
    this.name = "ClaudeServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.cause = cause;
  }
}

function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.trim()) {
    throw new ClaudeServiceError("AI service is not configured", {
      statusCode: 503,
      code: "AI_NOT_CONFIGURED",
    });
  }
  return key.trim();
}

function getModel() {
  return process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
}

function getTimeoutMs() {
  const parsed = Number(process.env.CLAUDE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function parseAnthropicError(status, body) {
  const type = body?.error?.type || "api_error";
  const detail = body?.error?.message || "Unexpected error from AI provider";

  if (status === 401 || status === 403) {
    return new ClaudeServiceError("AI service authentication failed", {
      statusCode: 503,
      code: "AI_AUTH_FAILED",
    });
  }

  if (status === 429) {
    return new ClaudeServiceError("AI service is temporarily busy", {
      statusCode: 503,
      code: "AI_RATE_LIMITED",
    });
  }

  if (status === 400) {
    return new ClaudeServiceError("Invalid request to AI provider", {
      statusCode: 400,
      code: "AI_BAD_REQUEST",
      cause: detail,
    });
  }

  return new ClaudeServiceError("AI provider request failed", {
    statusCode: 502,
    code: type.toUpperCase(),
    cause: detail,
  });
}

function extractTextContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Send a message to Claude and return the assistant text response.
 *
 * @param {object} options
 * @param {string} options.system - System prompt
 * @param {string} options.userMessage - User message content
 * @param {number} [options.maxTokens] - Max output tokens
 * @returns {Promise<{ text: string, model: string, usage?: object }>}
 */
export async function sendMessage({ system, userMessage, maxTokens = DEFAULT_MAX_TOKENS }) {
  if (!system?.trim()) {
    throw new ClaudeServiceError("System prompt is required", {
      statusCode: 500,
      code: "INVALID_INTERNAL_REQUEST",
    });
  }

  if (!userMessage?.trim()) {
    throw new ClaudeServiceError("User message is required", {
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
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw parseAnthropicError(response.status, body);
    }

    const text = extractTextContent(body.content);
    if (!text) {
      throw new ClaudeServiceError("AI provider returned an empty response", {
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
    if (error instanceof ClaudeServiceError) {
      throw error;
    }

    if (error.name === "AbortError") {
      throw new ClaudeServiceError("AI request timed out", {
        statusCode: 504,
        code: "AI_TIMEOUT",
      });
    }

    throw new ClaudeServiceError("Failed to reach AI provider", {
      statusCode: 502,
      code: "AI_NETWORK_ERROR",
      cause: error.message,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export { ClaudeServiceError };
