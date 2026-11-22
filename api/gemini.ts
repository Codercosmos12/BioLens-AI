const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';
const MODEL_CHAIN = [PRIMARY_MODEL, FALLBACK_MODEL];
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

function extractRawChunkDelta(data: GeminiRestResponse): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p?.thought !== true && typeof p?.text === 'string' && p.text.length > 0)
    .map((p) => p.text ?? '')
    .join('');
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

function parseJsonBody(req: any): Record<string, unknown> {
  if (req?.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req?.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function buildGenerationConfig(model: string, useJsonSchema: boolean): Record<string, unknown> {
  const config: Record<string, unknown> = {
    temperature: 0.4,
    ...(model.includes('3.8') ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
  };

  if (useJsonSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = {
      type: 'OBJECT',
      properties: {
        keyFindings: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            '3 concise empirical findings grounded in exact numbers, units, r, R2, p-value, and outlier sample names.',
        },
        confoundersAndBias: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description:
            '3 potential confounding variables, non-linearities, or experimental biases evident in the data.',
        },
        nextStepHypotheses: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              rationale: { type: 'STRING' },
              protocol: { type: 'STRING' },
              expectedMetricShift: { type: 'STRING' },
            },
          },
          description: '3 actionable, testable next-step scientific hypotheses.',
        },
      },
    };
  }

  return config;
}

async function callGeminiRest(
  apiKey: string,
  params: {
    systemInstruction: string;
    prompt: string;
    useJsonSchema?: boolean;
  }
): Promise<{ text: string; modelUsed: string }> {
  let lastError: { message: string; status: number } = {
    message: 'Gemini API request failed across primary and fallback models.',
    status: 502,
  };

  for (const model of MODEL_CHAIN) {
    const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: params.systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: params.prompt }],
          },
        ],
        generationConfig: buildGenerationConfig(model, Boolean(params.useJsonSchema)),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as GeminiRestResponse;
    if (!response.ok) {
      const msg = data?.error?.message || `HTTP ${response.status}`;
      lastError = { message: msg, status: mapErrorStatus(msg, response.status) };
      continue;
    }

    const text = extractNonThoughtText(data);
    if (!text) {
      lastError = { message: `Empty response returned by ${model}`, status: 502 };
      continue;
    }

    return { text, modelUsed: model };
  }

  const err = new Error(lastError.message) as Error & { status?: number };
  err.status = lastError.status;
  throw err;
}

async function streamGeminiRestToNdjson(
  apiKey: string,
  params: { systemInstruction: string; prompt: string },
  res: any
): Promise<void> {
  let headersSent = false;
  let lastError: { message: string; status: number } = {
    message: 'Gemini stream request failed.',
    status: 502,
  };

  for (const model of MODEL_CHAIN) {
    let emittedForModel = false;
    try {
      const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: params.systemInstruction }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: params.prompt }],
            },
          ],
          generationConfig: buildGenerationConfig(model, false),
        }),
      });

      if (!response.ok || !response.body) {
        const errBody = (await response.json().catch(() => ({}))) as GeminiRestResponse;
        const msg = errBody?.error?.message || `HTTP ${response.status}`;
        lastError = { message: msg, status: mapErrorStatus(msg, response.status) };
        continue;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      const handleEventBlock = (block: string) => {
        const dataLines = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .filter((l) => l && l !== '[DONE]');

        for (const jsonLine of dataLines) {
          let parsed: GeminiRestResponse;
          try {
            parsed = JSON.parse(jsonLine) as GeminiRestResponse;
          } catch {
            continue;
          }
          const delta = extractRawChunkDelta(parsed);
          if (!delta) continue;

          if (!headersSent) {
            headersSent = true;
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('X-Accel-Buffering', 'no');
          }
          emittedForModel = true;
          res.write(`${JSON.stringify({ type: 'chunk', delta, modelUsed: model })}\n`);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = events.pop() ?? '';
        for (const evt of events) {
          handleEventBlock(evt);
        }
      }

      sseBuffer += decoder.decode();
      if (sseBuffer.trim()) {
        handleEventBlock(sseBuffer);
      }

      if (emittedForModel) {
        res.write(`${JSON.stringify({ type: 'done', modelUsed: model })}\n`);
        res.end();
        return;
      }

      lastError = { message: `Empty stream returned by ${model}`, status: 502 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = { message: msg, status: mapErrorStatus(msg) };
      if (headersSent && emittedForModel) {
        res.write(`${JSON.stringify({ type: 'error', error: msg })}\n`);
        res.end();
        return;
      }
    }
  }

  if (!headersSent) {
    res.status(lastError.status).json({ error: lastError.message });
  } else {
    res.write(`${JSON.stringify({ type: 'error', error: lastError.message })}\n`);
    res.end();
  }
}

function buildChatPrompt(body: Record<string, unknown>): {
  question: string;
  statisticalContextJson: string;
  systemInstruction: string;
  prompt: string;
} {
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  const methodology =
    typeof body.methodology === 'string' ? body.methodology.trim().slice(0, 4000) : '';
  const statisticalContextJson =
    typeof body.statisticalContextJson === 'string'
      ? body.statisticalContextJson.trim().slice(0, 24000)
      : '';
  const customSystemInstruction =
    typeof body.systemInstruction === 'string' ? body.systemInstruction.trim().slice(0, 4000) : '';

  const rawHistory = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const recentTranscript = rawHistory
    .filter(
      (item): item is { role: string; content: string } =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as { role?: unknown }).role === 'string' &&
        typeof (item as { content?: unknown }).content === 'string'
    )
    .map(
      (m) => `${m.role === 'user' ? 'Researcher' : 'BioLens Copilot'}: ${m.content.slice(0, 1500)}`
    )
    .join('\n');

  const defaultSystemInstruction =
    'You are BioLens Copilot, a friendly, sharp STEM Research Co-Scientist built for the BioLens AI platform. Respond warmly and concisely to conversational greetings or capability questions, and handle scientific, statistical, or tricky multi-step questions thoroughly using the injected dataset context (n, mean, std dev, Pearson r, R², p-value, and |Z| > 2.0 outlier rows). Cite exact sample IDs and metrics without fabricating data.';

  const systemInstruction = customSystemInstruction || defaultSystemInstruction;
  const prompt = `Experiment Methodology: ${methodology || 'Laboratory measurement sweep'}\n\nStatistical Context:\n${statisticalContextJson}\n\n${
    recentTranscript ? `Conversation History:\n${recentTranscript}\n\n` : ''
  }Researcher Question: ${question}`;

  return { question, statisticalContextJson, systemInstruction, prompt };
}

export default async function handler(req: any, res: any): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = getServerGeminiKey();
  if (!apiKey) {
    res.status(503).json({
      error:
        'Server GEMINI_API_KEY is not configured yet. Add it in Vercel Environment Variables or switch to Demo Intelligence Mode.',
      code: 'MISSING_SERVER_KEY',
    });
    return;
  }

  const body = parseJsonBody(req);
  const queryAction = typeof req.query?.action === 'string' ? req.query.action.toLowerCase() : '';
  const bodyAction = typeof body.action === 'string' ? body.action.toLowerCase() : '';
  const action = queryAction || bodyAction;

  // 1. Synthesis handler
  if (
    action === 'synthesize' ||
    (!action && typeof body.statisticalContextJson === 'string' && !body.question)
  ) {
    const methodology =
      typeof body.methodology === 'string' ? body.methodology.trim().slice(0, 4000) : '';
    const statisticalContextJson =
      typeof body.statisticalContextJson === 'string'
        ? body.statisticalContextJson.trim().slice(0, 24000)
        : '';

    if (!statisticalContextJson) {
      res.status(400).json({ error: 'Missing statisticalContextJson payload.' });
      return;
    }

    const systemInstruction =
      'You are BioLens AI, an expert scientific research co-scientist. Analyze the provided quantitative laboratory summary strictly using the observed metrics, units, correlation values, and Z-score anomalies. Never fabricate measurements not present in the statistical context.';
    const prompt = `Analyze this laboratory experiment and return structured empirical insights in JSON.\n\nMethodology: ${methodology || 'Laboratory measurement sweep'}\n\nStatistical Context:\n${statisticalContextJson}`;

    try {
      const { text, modelUsed } = await callGeminiRest(apiKey, {
        systemInstruction,
        prompt,
        useJsonSchema: true,
      });

      const parsed = JSON.parse(text) as {
        keyFindings?: string[];
        confoundersAndBias?: string[];
        nextStepHypotheses?: Array<{
          title: string;
          rationale: string;
          protocol: string;
          expectedMetricShift: string;
        }>;
      };

      res.status(200).json({
        mode: 'gemini-live',
        modelUsed,
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings.slice(0, 4) : [],
        confoundersAndBias: Array.isArray(parsed.confoundersAndBias)
          ? parsed.confoundersAndBias.slice(0, 4)
          : [],
        nextStepHypotheses: Array.isArray(parsed.nextStepHypotheses)
          ? parsed.nextStepHypotheses.slice(0, 3)
          : [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini synthesis request failed.';
      const status = (err as { status?: number })?.status ?? mapErrorStatus(message);
      res.status(status).json({ error: message });
    }
    return;
  }

  // 2. Streaming Chat handler
  if (action === 'stream') {
    const { question, statisticalContextJson, systemInstruction, prompt } = buildChatPrompt(body);
    if (!question || !statisticalContextJson) {
      res.status(400).json({ error: 'Both question and statisticalContextJson are required.' });
      return;
    }

    await streamGeminiRestToNdjson(apiKey, { systemInstruction, prompt }, res);
    return;
  }

  // 3. Standard Chat or Direct Prompt handler
  if (action === 'chat' || typeof body.question === 'string') {
    const { question, statisticalContextJson, systemInstruction, prompt } = buildChatPrompt(body);
    if (!question || !statisticalContextJson) {
      res.status(400).json({ error: 'Both question and statisticalContextJson are required.' });
      return;
    }

    try {
      const { text, modelUsed } = await callGeminiRest(apiKey, {
        systemInstruction,
        prompt,
      });
      res.status(200).json({
        content: text,
        mode: 'gemini-live',
        modelUsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini chat request failed.';
      const status = (err as { status?: number })?.status ?? mapErrorStatus(message);
      res.status(status).json({ error: message });
    }
    return;
  }

  // Direct generic prompt fallback
  const directPrompt =
    typeof body.prompt === 'string'
      ? body.prompt.trim()
      : typeof body.contents === 'string'
        ? body.contents.trim()
        : '';
  if (!directPrompt) {
    res.status(400).json({ error: 'Missing prompt or research request payload.' });
    return;
  }

  const directSystem =
    typeof body.systemInstruction === 'string'
      ? body.systemInstruction.trim()
      : 'You are BioLens AI, an expert scientific research assistant.';

  try {
    const { text, modelUsed } = await callGeminiRest(apiKey, {
      systemInstruction: directSystem,
      prompt: directPrompt,
    });
    res.status(200).json({
      content: text,
      text,
      mode: 'gemini-live',
      modelUsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini request failed.';
    const status = (err as { status?: number })?.status ?? mapErrorStatus(message);
    res.status(status).json({ error: message });
  }
}
