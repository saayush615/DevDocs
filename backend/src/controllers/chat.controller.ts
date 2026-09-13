// Chat controller: save user msg -> history -> FastAPI stream -> pipe -> save assistant msg.
import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Errors } from '../lib/errorFactory.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import { fetchAiQueryStream } from '../services/aiClient.service.js';
import { chatBodySchema } from '../lib/validation.js';

const FALLBACK = "I don't have enough information in the available documents.";

export async function postChat(req: AuthRequest, res: Response) {
  // 1. Validate + find-or-create owned conversation (throws -> global handler, headers not sent yet).
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) throw Errors.badRequest('Invalid body');
  const { question, conversationId } = parsed.data;

  let convId = conversationId;
  if (convId) {
    const owned = await prisma.conversation.findFirst({
      where: { id: convId, userId: req.userId },
    });
    if (!owned) throw Errors.notFound('Conversation not found');
  } else {
    const created = await prisma.conversation.create({
      data: { userId: req.userId, title: question.slice(0, 60) },
    });
    convId = created.id;
  }
  const id = convId as string;

  // 2. Persist user msg first, load last 10 as LLM context.
  await prisma.message.create({ data: { conversationId: id, role: 'user', content: question } });
  const prev = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const history = prev
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // 3. SSE headers from here on -> must answer as events, never as JSON error.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const aiRes = await fetchAiQueryStream({
      conversation_id: id,
      user_id: req.userId,
      question,
      history,
    });

    // 4. Pipe tokens through immediately + buffer them to save later.
    const reader = aiRes.body?.getReader();
    if (!reader) throw new Error('No stream body');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      buffer += text;
      res.write(text);
    }

    // 5. Final done-event carries citations + route; token events carry answer text.
    let answer = '';
    let citations = null;
    let routeTaken = 'simple';
    for (const line of buffer.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const payload = JSON.parse(line.replace('data: ', ''));
      if (payload.token) answer += payload.token;
      if (payload.done) {
        citations = payload.citations ?? null;
        routeTaken = payload.route_taken ?? 'simple';
      }
    }
    if (!answer.trim()) answer = FALLBACK;

    await prisma.message.create({
      data: {
        conversationId: id,
        role: 'assistant',
        content: answer.trim(),
        citations: citations ?? undefined,
        routeTaken,
      },
    });
    res.end();
  } catch (err) {
    // 6. AI down mid-stream: answer via SSE + save, so chat never hangs.
    console.error(err);
    res.write(`data: ${JSON.stringify({ token: FALLBACK + ' ' })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, citations: [], route_taken: 'simple' })}\n\n`);
    await prisma.message.create({
      data: { conversationId: id, role: 'assistant', content: FALLBACK },
    });
    res.end();
  }
}
