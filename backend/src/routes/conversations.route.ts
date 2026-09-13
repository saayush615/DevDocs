import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
} from '../controllers/conversations.controller.js';

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

conversationsRouter.post('/', asyncHandler(createConversation));
conversationsRouter.get('/', asyncHandler(listConversations));
conversationsRouter.get('/:id', asyncHandler(getConversation));
conversationsRouter.delete('/:id', asyncHandler(deleteConversation));
