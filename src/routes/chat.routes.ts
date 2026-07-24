import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { getChats, createChat, getMessages, createGroup, addParticipants, deleteGroup, updateGroupPicture, deleteMessage, clearChatMessages } from '../controllers/chat.controller';

const router = Router();

// Get all chats for the authenticated user
router.get('/', requireAuth, getChats as any);

// Create a new 1-on-1 chat
router.post('/', requireAuth, createChat as any);

// Create a new group chat
router.post('/group', requireAuth, createGroup as any);

// Get messages for a chat
router.get('/:chatId/messages', requireAuth, getMessages as any);

// Add participants to a group
router.post('/:chatId/participants', requireAuth, addParticipants as any);

// Update a group picture
router.patch('/:chatId/picture', requireAuth, updateGroupPicture as any);

// Delete a group chat (Admin only)
router.delete('/:chatId', requireAuth, deleteGroup as any);

// Delete a single message
router.delete('/messages/:messageId', requireAuth, deleteMessage as any);

// Clear all messages in a chat
router.delete('/:chatId/messages', requireAuth, clearChatMessages as any);

export default router;
