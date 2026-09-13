import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { postChat } from '../controllers/chat.controller.js';

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.post('/', asyncHandler(postChat));
