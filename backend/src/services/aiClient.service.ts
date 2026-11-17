// Single place that talks to FastAPI. Frontend never sees this URL/token.
import 'dotenv/config';

const AI_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
const Token = process.env.AI_SERVICE_TOKEN ?? '';

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${Token}`,
  };
}

// Ingest
export interface IngestResult {
  status: string;
  chunks_created: number;
}

export interface IngestSection {
  page: number;
  text: string;
}

interface ingestInput {
  document_id: string;
  user_id: string;
  content: string;
  source_type: string;
  title?: string;
  source_url?: string;
  sections?: IngestSection[];
}

export async function ingestDocument(input: ingestInput): Promise<IngestResult> {
  const res = await fetch(`${AI_URL}/ingest`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`AI ingest failed: ${res.status}`);
  return res.json() as Promise<IngestResult>;
}

// Query
export interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface fetchInput {
  conversation_id: string;
  user_id: string;
  question: string;
  history: HistoryItem[];
}

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const form = new FormData();
  const file = new File([new Uint8Array(buffer)], filename || 'speech.webm', {
    type: mimeType || 'audio/webm',
  });
  form.append('audio', file);
  const res = await fetch(`${AI_URL}/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Token}` },
    body: form,
  });
  if (res.status === 400) throw new Error('No speech detected');
  if (!res.ok) throw new Error(`AI transcribe failed: ${res.status}`);
  const json = (await res.json()) as { text?: string };
  return json.text ?? '';
}

export async function fetchAiQueryStream(input: fetchInput): Promise<Response> {
  const res = await fetch(`${AI_URL}/query/stream`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ ...input, tok_k: 5 }),
  });
  if (!res.ok) throw new Error(`AI query failed: ${res.status}`);
  return res;
}
