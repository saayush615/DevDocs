// Conversations controller: owned-CRUD. Every read checks userId (isolation).
import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Errors } from '../lib/errorFactory.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import { conversationBodySchema } from '../lib/validation.js';

export async function createConversation(req: AuthRequest, res: Response) {
  const parsed = conversationBodySchema.safeParse(req.body);
  const title = parsed.success ? (parsed.data.title ?? 'New chat') : 'New chat';
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
  const conv = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!conv) throw Errors.notFound('Conversation not found');
  res.status(200).json({
    success: true,
    message: 'Conversation fetched',
    data: conv,
  });
}

export async function deleteConversation(req: AuthRequest, res: Response) {
  const conv = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!conv) throw Errors.notFound('Conversation not found');
  await prisma.conversation.delete({ where: { id: conv.id } });
  res.status(200).json({
    success: true,
    message: 'Conversation deleted',
    data: null,
  });
}
