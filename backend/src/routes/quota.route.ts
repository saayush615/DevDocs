import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getQuota } from '../controllers/quota.controller.js';

export const quotaRouter = Router();
quotaRouter.use(requireAuth); // only authenticated users see their own usage

quotaRouter.get('/', asyncHandler(getQuota));