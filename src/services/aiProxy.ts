import { ResearchSynthesis } from '../types/research';

export interface ServerAiStatus {
  configured: boolean;
  primaryModel: string;
  fallbackModel: string;
}

export interface TestConnectionResponse {
  ok: boolean;
  model: string;
  reply?: string;
  error?: string;
}

export interface SynthesizeProxyRequest {
  methodology: string;
  statisticalContextJson: string;
}

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatProxyRequest {
  question: string;
  methodology: string;
  statisticalContextJson: string;
  systemInstruction?: string;
  history: ChatHistoryTurn[];
}

export interface ChatProxyResponse {
  content: string;
  mode: 'gemini-live';
  modelUsed: string;
}

export class ServerKeyMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerKeyMissingError';
  }
}

interface ProxyErrorBody {
  error?: string;
  code?: string;
}

function assertLocalApiPath(endpoint: string): void {
  if (!endpoint.startsWith('/api/')) {
    throw new Error(`Invalid AI proxy endpoint: ${endpoint}`);
  }
}

async function parseProxyResponse<TResponse>(response: Response): Promise<TResponse> {
  const payload = (await response.json().catch(() => ({}))) as TResponse & ProxyErrorBody;

  if (!response.ok) {
    if (payload.code === 'MISSING_SERVER_KEY') {
      throw new ServerKeyMissingError(
        payload.error ??
          'Server GEMINI_API_KEY is not configured yet in Settings > Secrets.'
      );
    }
    throw new Error(payload.error ?? `AI proxy request failed (HTTP ${response.status}).`);
  }

  return payload;
}

export async function getAiProxy<TResponse>(
  endpoint: string,
  signal?: AbortSignal
): Promise<TResponse> {
  assertLocalApiPath(endpoint);
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  return parseProxyResponse<TResponse>(response);
}

export async function postAiProxy<TResponse>(
  endpoint: string,
  body: unknown,
  signal?: AbortSignal
): Promise<TResponse> {
  assertLocalApiPath(endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  return parseProxyResponse<TResponse>(response);
}

export async function fetchServerAiStatus(signal?: AbortSignal): Promise<ServerAiStatus> {
  try {
    const data = await getAiProxy<Partial<ServerAiStatus>>('/api/ai/status', signal);
    return {
      configured: Boolean(data.configured),
      primaryModel: data.primaryModel ?? 'gemini-3.5-flash-lite',
      fallbackModel: data.fallbackModel ?? 'gemini-3.8-flash',
    };
  } catch {
    return {
      configured: false,
      primaryModel: 'gemini-3.5-flash-lite',
      fallbackModel: 'gemini-3.8-flash',
    };
  }
}

export async function testServerGeminiConnection(
  signal?: AbortSignal
): Promise<TestConnectionResponse> {
  const data = await postAiProxy<Partial<TestConnectionResponse>>('/api/ai/test', {}, signal);
  return {
    ok: Boolean(data.ok),
    model: data.model ?? 'gemini-3.5-flash-lite',
    reply: data.reply,
    error: data.error,
  };
}

export async function forwardSynthesisRequest(
  payload: SynthesizeProxyRequest,
  signal?: AbortSignal
): Promise<ResearchSynthesis> {
  const data = await postAiProxy<Partial<ResearchSynthesis>>(
    '/api/research/synthesize',
    payload,
    signal
  );

  return {
    mode: 'gemini-live',
    modelUsed: data.modelUsed ?? 'gemini-3.5-flash-lite',
    generatedAt:
      data.generatedAt ??
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    keyFindings: Array.isArray(data.keyFindings) ? data.keyFindings : [],
    confoundersAndBias: Array.isArray(data.confoundersAndBias)
      ? data.confoundersAndBias
      : [],
    nextStepHypotheses: Array.isArray(data.nextStepHypotheses)
      ? data.nextStepHypotheses
      : [],
  };
}

interface RawProxyChatPayload {
  content?: string;
  text?: string;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  mode?: 'gemini-live';
  modelUsed?: string;
}

function extractProxyChatText(payload: RawProxyChatPayload): string {
  const directContent = typeof payload.content === 'string' ? payload.content.trim() : '';
  if (directContent) return directContent;

  const directText = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (directText) return directText;

  const candidateText = (payload.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => part?.thought !== true && typeof part?.text === 'string' && part.text)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  return candidateText;
}

export async function forwardChatRequest(
  payload: ChatProxyRequest,
  signal?: AbortSignal
): Promise<ChatProxyResponse> {
  const data = await postAiProxy<RawProxyChatPayload>(
    '/api/research/chat',
    payload,
    signal
  );

  const content = extractProxyChatText(data);
  if (!content) {
    throw new Error(
      'The Gemini server returned an empty response. Please retry or switch to Demo Intelligence Mode.'
    );
  }

  return {
    content,
    mode: 'gemini-live',
    modelUsed: data.modelUsed ?? 'gemini-3.5-flash-lite',
  };
}

interface StreamNdjsonEvent {
  type?: 'chunk' | 'done' | 'error';
  delta?: string;
  modelUsed?: string;
  error?: string;
}

export async function forwardChatStreamRequest(
  payload: ChatProxyRequest,
  onChunk?: (partialText: string, modelUsed: string) => void,
  signal?: AbortSignal
): Promise<ChatProxyResponse> {
  const endpoint = '/api/research/chat/stream';
  assertLocalApiPath(endpoint);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson, application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => ({}))) as ProxyErrorBody;
    if (errPayload.code === 'MISSING_SERVER_KEY') {
      throw new ServerKeyMissingError(
        errPayload.error ??
          'Server GEMINI_API_KEY is not configured yet in Settings > Secrets.'
      );
    }
    throw new Error(errPayload.error ?? `AI stream request failed (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(
      'Streaming AI endpoint unavailable on static hosting. Switch to Demo Intelligence Mode.'
    );
  }

  if (!response.body) {
    const fallback = await forwardChatRequest(payload, signal);
    onChunk?.(fallback.content, fallback.modelUsed);
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let modelUsed = 'gemini-3.5-flash-lite';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let evt: StreamNdjsonEvent;
    try {
      evt = JSON.parse(trimmed) as StreamNdjsonEvent;
    } catch {
      return;
    }

    if (evt.modelUsed) {
      modelUsed = evt.modelUsed;
    }

    if (evt.type === 'error') {
      throw new Error(evt.error || 'Gemini streaming interrupted.');
    }

    if (evt.type === 'chunk' && typeof evt.delta === 'string' && evt.delta.length > 0) {
      fullText += evt.delta;
      onChunk?.(fullText, modelUsed);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      processLine(line);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    processLine(buffer);
  }

  const trimmedFull = fullText.trim();
  if (!trimmedFull) {
    throw new Error(
      'The Gemini stream returned an empty response. Please retry or switch to Demo Intelligence Mode.'
    );
  }

  return {
    content: trimmedFull,
    mode: 'gemini-live',
    modelUsed,
  };
}
