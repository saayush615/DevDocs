// Conversations controller: owned-CRUD. Every read checks userId (isolation).
import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Errors } from '../lib/errorFactory.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import { conversationBodySchema, conversationTitleSchema } from '../lib/validation.js';
import { assertLifetimeCap } from '../lib/quota.js';

export async function createConversation(req: AuthRequest, res: Response) {
  const parsed = conversationBodySchema.safeParse(req.body);
  const title = parsed.success ? (parsed.data.title ?? 'New chat') : 'New chat';

  // V0 lifetime cap — blocks the 51st chat with a 429 before any write.
  await assertLifetimeCap(req.userId, 'conversation');

  const conv = await prisma.conversation.create({ data: { userId: req.userId, title } });
  res.status(201).json({
    success: true,
    message: 'Conversation created',
    data: conv,
  });
}

export async function listConversations(req: AuthRequest, res: Response) {
  const list = await prisma.conversation.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, createdAt: true },
  });
  res.status(200).json({
    success: true,
    message: 'Conversations fetched',
    data: list,
  });
}

export async function getConversation(req: AuthRequest, res: Response) {
  // findFirst({id, userId}) = ownership check in one query. Never findUnique by id alone.
  const { id } = req.params;
  if (typeof id !== 'string') throw Errors.notFound('Conversation not found');

  const conv = await prisma.conversation.findFirst({
    where: { id, userId: req.userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conv) throw Errors.notFound('Conversation not found');
  res.status(200).json({
    success: true,
    message: 'Conversation fetched',
    data: conv,
  });
}

export async function updateConversation(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (typeof id !== 'string') throw Errors.notFound('Conversation not found');

  const parsed = conversationTitleSchema.safeParse(req.body);
  if (!parsed.success) throw Errors.badRequest('Title must be between 1 and 100 characters');

  const conv = await prisma.conversation.findFirst({
    where: { id, userId: req.userId },
  });
  if (!conv) throw Errors.notFound('Conversation not found');

  const updated = await prisma.conversation.update({
    where: { id: conv.id },
    data: { title: parsed.data.title },
    select: { id: true, title: true, createdAt: true },
  });
  res.status(200).json({
    success: true,
    message: 'Conversation updated',
    data: updated,
  });
}

export async function deleteConversation(req: AuthRequest, res: Response) {
  const { id } = req.params;
  if (typeof id !== 'string') throw Errors.notFound('Conversation not found');

  const conv = await prisma.conversation.findFirst({
    where: { id, userId: req.userId },
  });
  if (!conv) throw Errors.notFound('Conversation not found');
  await prisma.conversation.delete({ where: { id: conv.id } });
  res.status(200).json({
    success: true,
    message: 'Conversation deleted',
    data: null,
  });
}
