import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { getChats, createChat, getMessages, createGroup } from '../controllers/chat.controller';

const router = Router();

// Get all chats for the authenticated user
router.get('/', requireAuth, getChats as any);

// Create a new 1-on-1 chat
router.post('/', requireAuth, createChat as any);

// Create a new group chat
router.post('/group', requireAuth, createGroup as any);

// Get messages for a chat
router.get('/:chatId/messages', requireAuth, getMessages as any);

export default router;
