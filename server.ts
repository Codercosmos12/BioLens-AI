import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

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

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = getServerGeminiKey();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface GeminiPartLike {
  text?: string;
  thought?: boolean;
}

interface GeminiResponseLike {
  text?: string;
  candidates?: Array<{ content?: { parts?: GeminiPartLike[] } }>;
}

function extractGeminiText(response: unknown): string {
  if (!response || typeof response !== 'object') {
    return '';
  }

  const res = response as GeminiResponseLike;
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  if (Array.isArray(parts) && parts.length > 0) {
    const nonThoughtText = parts
      .filter(
        (part) =>
          part?.thought !== true &&
          typeof part?.text === 'string' &&
          part.text.trim().length > 0
      )
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (Boolean(nonThoughtText && nonThoughtText.trim().length > 0)) {
      return nonThoughtText;
    }
  }

  const directText = typeof res.text === 'string' ? res.text.trim() : '';
  if (Boolean(directText && directText.trim().length > 0)) {
    return directText;
  }

  return '';
}

function extractChunkNonThoughtText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') {
    return '';
  }
  const c = chunk as GeminiResponseLike;
  const parts = c.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    return parts
      .filter((part) => part?.thought !== true && typeof part?.text === 'string' && part.text)
      .map((part) => part.text ?? '')
      .join('');
  }
  return typeof c.text === 'string' ? c.text : '';
}

async function runGenerateContentFast(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: string;
    systemInstruction?: string;
    responseSchema?: Record<string, unknown>;
    maxOutputTokens?: number;
    abortSignal?: AbortSignal;
  }
) {
  const config: Record<string, unknown> = {
    ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
    temperature: 0.4,
    ...(typeof params.maxOutputTokens === 'number'
      ? { maxOutputTokens: params.maxOutputTokens }
      : {}),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
    ...(params.model.includes('3.8')
      ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
      : {}),
    ...(params.responseSchema
      ? {
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        }
      : {}),
  };

  return ai.models.generateContent({
    model: params.model,
    contents: [{ role: 'user', parts: [{ text: params.contents }] }],
    config,
  });
}

async function runGenerateContentStreamFast(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: string;
    systemInstruction?: string;
    abortSignal?: AbortSignal;
  }
) {
  const config: Record<string, unknown> = {
    ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
    temperature: 0.4,
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
    ...(params.model.includes('3.8')
      ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
      : {}),
  };

  return ai.models.generateContentStream({
    model: params.model,
    contents: [{ role: 'user', parts: [{ text: params.contents }] }],
    config,
  });
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: string;
    systemInstruction: string;
    responseSchema?: Record<string, unknown>;
  }
): Promise<{ text: string; modelUsed: string }> {
  let lastError: unknown = null;

  for (const model of MODEL_CHAIN) {
    try {
      const response = await runGenerateContentFast(ai, {
        model,
        contents: params.contents,
        systemInstruction: params.systemInstruction,
        responseSchema: params.responseSchema,
      });
      const text = extractGeminiText(response);
      if (!text) {
        throw new Error(`Empty response returned by ${model}`);
      }
      return { text, modelUsed: model };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[BioLens AI] Gemini API error on ${model}:`, errMsg);
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gemini API request failed across primary and fallback models.');
}

function mapGeminiError(err: unknown): { status: number; message: string } {
  const rawMessage =
    err instanceof Error && err.message.trim()
      ? err.message.trim()
      : 'Gemini API request failed.';
  const upper = rawMessage.toUpperCase();

  if (upper.includes('PERMISSION_DENIED') || upper.includes('403')) {
    return { status: 403, message: rawMessage };
  }
  if (upper.includes('API_KEY_INVALID') || upper.includes('INVALID_ARGUMENT') || upper.includes('400')) {
    return { status: 400, message: rawMessage };
  }
  if (upper.includes('NOT_FOUND') || upper.includes('404')) {
    return { status: 404, message: rawMessage };
  }
  if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('429')) {
    return { status: 429, message: rawMessage };
  }
  return {
    status: 502,
    message: rawMessage,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/ai/status', (_req: Request, res: Response) => {
    const configured = Boolean(getServerGeminiKey());
    res.json({
      configured,
      primaryModel: MODEL_CHAIN[0],
      fallbackModel: MODEL_CHAIN[1],
    });
  });

  app.post('/api/ai/test', async (_req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        ok: false,
        model: MODEL_CHAIN[0],
        error:
          'Server GEMINI_API_KEY is not configured yet. Add it in Settings > Secrets or switch to Demo Intelligence Mode.',
        code: 'MISSING_SERVER_KEY',
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7500);

    try {
      let lastErr: unknown = null;
      for (const model of MODEL_CHAIN) {
        try {
          const response = await runGenerateContentFast(ai, {
            model,
            systemInstruction: 'You are a helpful assistant.',
            contents: 'Say hello in one short sentence.',
            maxOutputTokens: 1024,
            abortSignal: controller.signal,
          });
          const text = extractGeminiText(response);
          if (Boolean(text && text.trim().length > 0)) {
            res.json({
              ok: true,
              model,
              reply: text.trim(),
            });
            return;
          }
          lastErr = new Error(`Empty response returned by ${model}`);
        } catch (modelErr) {
          if (controller.signal.aborted) {
            throw modelErr;
          }
          lastErr = modelErr;
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`Empty response returned by ${MODEL_CHAIN[0]}`);
    } catch (err) {
      if (controller.signal.aborted) {
        res.status(504).json({
          ok: false,
          model: MODEL_CHAIN[0],
          error: 'Verification timed out after 8s — check your network or API key.',
        });
        return;
      }
      const rawMsg = err instanceof Error ? err.message : 'Gemini connection test failed.';
      console.error(`[BioLens AI] Gemini connection test error (${MODEL_CHAIN[0]}):`, rawMsg);
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({
        ok: false,
        model: MODEL_CHAIN[0],
        error: mapped.message,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  app.post('/api/research/synthesize', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Server GEMINI_API_KEY is not configured yet. Add it in Settings > Secrets or switch to Demo Intelligence Mode.',
        code: 'MISSING_SERVER_KEY',
      });
      return;
    }

    const body = req.body as {
      methodology?: unknown;
      statisticalContextJson?: unknown;
    };

    const methodology =
      typeof body?.methodology === 'string' ? body.methodology.trim().slice(0, 4000) : '';
    const statisticalContextJson =
      typeof body?.statisticalContextJson === 'string'
        ? body.statisticalContextJson.trim().slice(0, 24000)
        : '';

    if (!statisticalContextJson) {
      res.status(400).json({ error: 'Missing statisticalContextJson payload.' });
      return;
    }

    const systemInstruction =
      'You are BioLens AI, an expert scientific research co-scientist. Analyze the provided quantitative laboratory summary strictly using the observed metrics, units, correlation values, and Z-score anomalies. Never fabricate measurements not present in the statistical context.';

    const prompt = `Analyze this laboratory experiment and return structured empirical insights in JSON.\n\nMethodology: ${methodology || 'Laboratory measurement sweep'}\n\nStatistical Context:\n${statisticalContextJson}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        keyFindings: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            '3 concise empirical findings grounded in exact numbers, units, r, R2, p-value, and outlier sample names.',
        },
        confoundersAndBias: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            '3 potential confounding variables, non-linearities, or experimental biases evident in the data.',
        },
        nextStepHypotheses: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              rationale: { type: Type.STRING },
              protocol: { type: Type.STRING },
              expectedMetricShift: { type: Type.STRING },
            },
          },
          description: '3 actionable, testable next-step scientific hypotheses.',
        },
      },
    };

    try {
      const { text, modelUsed } = await generateWithFallback(ai, {
        contents: prompt,
        systemInstruction,
        responseSchema: schema,
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

      res.json({
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
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  const buildChatPromptPayload = (rawBody: unknown) => {
    const body = (rawBody ?? {}) as {
      question?: unknown;
      methodology?: unknown;
      statisticalContextJson?: unknown;
      systemInstruction?: unknown;
      history?: unknown;
    };

    const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
    const methodology =
      typeof body.methodology === 'string' ? body.methodology.trim().slice(0, 4000) : '';
    const statisticalContextJson =
      typeof body.statisticalContextJson === 'string'
        ? body.statisticalContextJson.trim().slice(0, 24000)
        : '';
    const customSystemInstruction =
      typeof body.systemInstruction === 'string'
        ? body.systemInstruction.trim().slice(0, 4000)
        : '';

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
        (m) =>
          `${m.role === 'user' ? 'Researcher' : 'BioLens Copilot'}: ${m.content.slice(0, 1500)}`
      )
      .join('\n');

    const defaultSystemInstruction =
      'You are BioLens Copilot, a friendly, sharp STEM Research Co-Scientist built for the BioLens AI platform. Respond warmly and concisely to conversational greetings or capability questions, and handle scientific, statistical, or tricky multi-step questions thoroughly using the injected dataset context (n, mean, std dev, Pearson r, R², p-value, and |Z| > 2.0 outlier rows). Cite exact sample IDs and metrics without fabricating data.';

    const systemInstruction = customSystemInstruction || defaultSystemInstruction;
    const prompt = `Experiment Methodology: ${methodology || 'Laboratory measurement sweep'}\n\nStatistical Context:\n${statisticalContextJson}\n\n${
      recentTranscript ? `Conversation History:\n${recentTranscript}\n\n` : ''
    }Researcher Question: ${question}`;

    return { question, statisticalContextJson, systemInstruction, prompt };
  };

  app.post('/api/research/chat', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Server GEMINI_API_KEY is not configured yet. Add it in Settings > Secrets or switch to Demo Intelligence Mode.',
        code: 'MISSING_SERVER_KEY',
      });
      return;
    }

    const { question, statisticalContextJson, systemInstruction, prompt } = buildChatPromptPayload(
      req.body
    );

    if (!question || !statisticalContextJson) {
      res.status(400).json({ error: 'Both question and statisticalContextJson are required.' });
      return;
    }

    try {
      const { text, modelUsed } = await generateWithFallback(ai, {
        contents: prompt,
        systemInstruction,
      });

      res.json({
        content: text,
        mode: 'gemini-live',
        modelUsed,
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/research/chat/stream', async (req: Request, res: Response) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Server GEMINI_API_KEY is not configured yet. Add it in Settings > Secrets or switch to Demo Intelligence Mode.',
        code: 'MISSING_SERVER_KEY',
      });
      return;
    }

    const { question, statisticalContextJson, systemInstruction, prompt } = buildChatPromptPayload(
      req.body
    );

    if (!question || !statisticalContextJson) {
      res.status(400).json({ error: 'Both question and statisticalContextJson are required.' });
      return;
    }

    const controller = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    let headersSent = false;
    let lastError: unknown = null;

    for (const model of MODEL_CHAIN) {
      let emittedForModel = false;
      try {
        const stream = await runGenerateContentStreamFast(ai, {
          model,
          contents: prompt,
          systemInstruction,
          abortSignal: controller.signal,
        });

        for await (const chunk of stream) {
          if (controller.signal.aborted) {
            return;
          }
          const delta = extractChunkNonThoughtText(chunk);
          if (!delta) continue;

          if (!headersSent) {
            headersSent = true;
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders?.();
          }

          emittedForModel = true;
          res.write(`${JSON.stringify({ type: 'chunk', delta, modelUsed: model })}\n`);
        }

        if (emittedForModel) {
          res.write(`${JSON.stringify({ type: 'done', modelUsed: model })}\n`);
          res.end();
          return;
        }

        throw new Error(`Empty stream returned by ${model}`);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[BioLens AI] Gemini stream error on ${model}:`, errMsg);
        lastError = err;

        if (headersSent && emittedForModel) {
          res.write(`${JSON.stringify({ type: 'error', error: errMsg })}\n`);
          res.end();
          return;
        }
      }
    }

    const mapped = mapGeminiError(lastError);
    if (!headersSent) {
      res.status(mapped.status).json({ error: mapped.message });
    } else {
      res.write(`${JSON.stringify({ type: 'error', error: mapped.message })}\n`);
      res.end();
    }
  });

  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtml = path.resolve(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      if (!fs.existsSync(indexHtml)) {
        res.status(503).send('Production build missing. Run `npm run build` before `npm start`.');
        return;
      }
      res.sendFile(indexHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BioLens AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start BioLens AI server:', err);
  process.exit(1);
});
