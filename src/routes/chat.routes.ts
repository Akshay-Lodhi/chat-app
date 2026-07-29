import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { 
  getChats, 
  createChat, 
  getMessages, 
  createGroup, 
  addParticipants, 
  removeParticipant, 
  deleteGroup, 
  updateGroupPicture, 
  deleteMessage, 
  clearChatMessages, 
  getCalls, 
  clearCallLogs, 
  toggleStarMessage, 
  getStarredMessages, 
  togglePinChat, 
  togglePinMessage,
  updateDisappearingTimer,
  scheduleMessageController,
  getPendingScheduledMessagesController,
  cancelScheduledMessageController,
  transcribeAudioController,
  summarizeChatController,
  getSmartRepliesController
} from '../controllers/chat.controller';

const router = Router();

// Get all chats for the authenticated user
router.get('/', requireAuth, getChats as any);

// Get paginated call logs for the authenticated user
router.get('/calls', requireAuth, getCalls as any);

// Delete/Clear all call logs for the authenticated user
router.delete('/calls', requireAuth, clearCallLogs as any);

// Create a new 1-on-1 chat
router.post('/', requireAuth, createChat as any);

// Create a new group chat
router.post('/group', requireAuth, createGroup as any);

// Get messages for a chat
router.get('/:chatId/messages', requireAuth, getMessages as any);

// Add participants to a group
router.post('/:chatId/participants', requireAuth, addParticipants as any);

// Remove a participant from a group
router.delete('/:chatId/participants/:participantId', requireAuth, removeParticipant as any);

// Update a group picture
router.patch('/:chatId/picture', requireAuth, updateGroupPicture as any);

// Delete a group chat (Admin only)
router.delete('/:chatId', requireAuth, deleteGroup as any);

// Delete a single message
router.delete('/messages/:messageId', requireAuth, deleteMessage as any);

// Clear all messages in a chat
router.delete('/:chatId/messages', requireAuth, clearChatMessages as any);

// Get starred messages
router.get('/messages/starred', requireAuth, getStarredMessages as any);

// Toggle star on a message
router.post('/messages/star', requireAuth, toggleStarMessage as any);

// Toggle pin on a chat
router.post('/:chatId/pin', requireAuth, togglePinChat as any);

// Toggle pin on a message
router.post('/messages/:messageId/pin', requireAuth, togglePinMessage as any);

// Update disappearing message timer for a chat
router.put('/:chatId/disappearing', requireAuth, updateDisappearingTimer as any);

// Schedule a message
router.post('/:chatId/schedule', requireAuth, scheduleMessageController as any);

// Get pending scheduled messages for a chat
router.get('/:chatId/scheduled', requireAuth, getPendingScheduledMessagesController as any);

// Cancel a scheduled message
router.delete('/scheduled/:messageId', requireAuth, cancelScheduledMessageController as any);

// Transcribe voice note message
router.post('/messages/:messageId/transcribe', requireAuth, transcribeAudioController as any);

// Summarize chat history with AI
router.post('/:chatId/summarize', requireAuth, summarizeChatController as any);

// Generate AI smart reply suggestions
router.post('/smart-replies', requireAuth, getSmartRepliesController as any);

export default router;
