const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiRestResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

function getServerGeminiKey(): string {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (
    !apiKey ||
    apiKey === 'MY_GEMINI_API_KEY' ||
    apiKey.startsWith('YOUR_') ||
    apiKey.startsWith('<')
  ) {
    return '';
  }
  return apiKey;
}

function setCorsHeaders(res: any): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

function extractNonThoughtText(data: GeminiRestResponse): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p?.thought !== true && typeof p?.text === 'string' && p.text.length > 0)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}

function mapErrorStatus(errMsg: string, httpStatus?: number): number {
  if (httpStatus && httpStatus >= 400 && httpStatus < 600) {
    return httpStatus;
  }
  const upper = errMsg.toUpperCase();
  if (upper.includes('PERMISSION_DENIED') || upper.includes('403')) return 403;
  if (upper.includes('API_KEY_INVALID') || upper.includes('INVALID_ARGUMENT') || upper.includes('400')) {
    return 400;
  }
  if (upper.includes('NOT_FOUND') || upper.includes('404')) return 404;
  if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('429')) return 429;
  return 502;
}

async function runHealthVerification(
  apiKey: string,
  model: string,
  signal: AbortSignal
): Promise<{ ok: true; reply: string } | { ok: false; status: number; error: string }> {
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const generationConfig: Record<string, unknown> = {
    temperature: 0.4,
    maxOutputTokens: 1024,
    ...(model.includes('3.8') ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Say hello in one short sentence.' }],
        },
      ],
      generationConfig,
    }),
    signal,
  });

  const data = (await response.json().catch(() => ({}))) as GeminiRestResponse;
  if (!response.ok) {
    const errMsg = data?.error?.message || `HTTP ${response.status}`;
    return {
      ok: false,
      status: mapErrorStatus(errMsg, response.status),
      error: errMsg,
    };
  }

  const reply = extractNonThoughtText(data);
  if (!reply) {
    return {
      ok: false,
      status: 502,
      error: `Empty response returned by ${model}`,
    };
  }

  return { ok: true, reply };
}

export default async function handler(req: any, res: any): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const apiKey = getServerGeminiKey();
  const action =
    typeof req.query?.action === 'string' ? req.query.action.toLowerCase() : '';
  const shouldTest = req.method === 'POST' || action === 'test';

  if (!shouldTest) {
    res.status(200).json({
      ok: true,
      configured: Boolean(apiKey),
      primaryModel: PRIMARY_MODEL,
      fallbackModel: FALLBACK_MODEL,
    });
    return;
  }

  if (!apiKey) {
    res.status(503).json({
      ok: false,
      model: PRIMARY_MODEL,
      error:
        'Server GEMINI_API_KEY is not configured yet. Add it in Vercel Environment Variables or switch to Demo Intelligence Mode.',
      code: 'MISSING_SERVER_KEY',
    });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7500);

  try {
    const models = [PRIMARY_MODEL, FALLBACK_MODEL];
    let lastError = 'Gemini connection test failed.';
    let lastStatus = 502;

    for (const model of models) {
      const result = await runHealthVerification(apiKey, model, controller.signal);
      if (result.ok) {
        res.status(200).json({
          ok: true,
          model,
          reply: result.reply,
        });
        return;
      }
      lastError = result.error;
      lastStatus = result.status;
    }

    res.status(lastStatus).json({
      ok: false,
      model: PRIMARY_MODEL,
      error: lastError,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      res.status(504).json({
        ok: false,
        model: PRIMARY_MODEL,
        error: 'Verification timed out after 8s — check your network or API key.',
      });
      return;
    }
    const errMsg = err instanceof Error ? err.message : 'Gemini connection test failed.';
    res.status(mapErrorStatus(errMsg)).json({
      ok: false,
      model: PRIMARY_MODEL,
      error: errMsg,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
