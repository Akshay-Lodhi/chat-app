import { Response } from 'express';
import { getIO } from '../socket';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ChatService } from '../services/chat.service';
import { redis } from '../lib/redis';
import { transcribeVoiceNote, summarizeChatMessages, generateSmartReplies, generateAIResponse, generateAIPrivateDraft } from '../services/ai.service';

export const getChats = async (req: AuthRequest, res: Response) => {
  try {
    const chats = await ChatService.getChatsForUser(req.user!.userId);
    res.json(chats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const cursor = req.query.cursor ? (req.query.cursor as string) : undefined;

    const messages = await ChatService.getMessagesForChat(req.user!.userId, chatId, limit, cursor);
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const createChat = async (req: AuthRequest, res: Response) => {
  try {
    const { contactId } = req.body;
    if (!contactId) return res.status(400).json({ error: 'Contact ID is required' });

    const chat = await ChatService.createOneOnOneChat(req.user!.userId, contactId);
    
    // Auto-join sockets and notify
    const io = getIO().of('/chat');
    chat.participants.forEach((p: any) => {
      io.in(p.userId).socketsJoin(chat.id);
    });
    io.to(chat.id).emit('chat-created', chat);

    res.json(chat);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { name, participantIds, groupPicture } = req.body;
    if (!name || !participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'Name and participantIds are required' });
    }

    const chat = await ChatService.createGroupChat(req.user!.userId, name, participantIds, groupPicture);
    
    // Auto-join sockets and notify
    const io = getIO().of('/chat');
    chat.participants.forEach((p: any) => {
      io.in(p.userId).socketsJoin(chat.id);
    });
    io.to(chat.id).emit('chat-created', chat);

    res.json(chat);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const addParticipants = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { participantIds } = req.body;
    
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'participantIds are required' });
    }

    const chat = await ChatService.addParticipantsToGroup(req.user!.userId, chatId, participantIds);
    
    const io = getIO().of('/chat');
    participantIds.forEach(id => {
      io.in(id).socketsJoin(chatId);
    });
    
    io.to(chatId).emit('chat-created', chat); 
    io.to(chatId).emit('chat-updated', chat); 
    
    res.json(chat);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const removeParticipant = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const participantId = req.params.participantId as string;

    const chat = await ChatService.removeParticipantFromGroup(req.user!.userId, chatId, participantId);
    
    const io = getIO().of('/chat');
    
    io.in(participantId).emit('chat-deleted', { chatId });
    io.in(participantId).socketsLeave(chatId);
    io.to(chatId).emit('chat-updated', chat);
    
    res.json(chat);
  } catch (error: any) {
    console.error(error);
    res.status(403).json({ error: error.message || 'Server error' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    await ChatService.deleteGroupChat(req.user!.userId, chatId);
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error: any) {
    console.error(error);
    if (error.message === 'Chat not found' || error.message === 'Not authorized to delete this group' || error.message === 'Cannot delete a 1-on-1 chat') {
      res.status(403).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
};

export const updateGroupPicture = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { groupPicture } = req.body;
    if (!groupPicture) return res.status(400).json({ error: 'groupPicture is required' });

    const chat = await ChatService.updateGroupPicture(req.user!.userId, chatId, groupPicture);
    
    getIO().of('/chat').to(chatId).emit('chat-updated', chat);

    res.json(chat);
  } catch (error: any) {
    console.error(error);
    if (error.message === 'Group chat not found' || error.message === 'Only the group admin can update the group picture') {
      res.status(403).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const messageId = req.params.messageId as string;
    const { deleteFor } = req.body; 
    const result = await ChatService.deleteMessage(req.user!.userId, messageId, deleteFor || 'everyone');
    
    if (result.deletedForEveryone) {
      getIO().of('/chat').to(result.chatId).emit('message-deleted', {
        messageId,
        messageIds: result.messageIds,
        chatId: result.chatId,
        deleteFor: 'everyone',
        deletedAt: new Date().toISOString()
      });
    }

    res.json({ success: true, messageIds: result.messageIds });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const clearChatMessages = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    await ChatService.clearChatMessages(req.user!.userId, chatId);
    const io = getIO().of('/chat');
    io.to(chatId).emit('chat-cleared', { chatId });
    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const getCalls = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || '1');
    const limit = parseInt((req.query.limit as string) || '30');
    const callsData = await ChatService.getCallsForUser(req.user!.userId, page, limit);
    res.json(callsData);
  } catch (error) {
    console.error('Error in getCalls controller:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const clearCallLogs = async (req: AuthRequest, res: Response) => {
  try {
    await ChatService.clearCallLogsForUser(req.user!.userId);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const toggleStarMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.body;
    const result = await ChatService.toggleStarMessage(req.user!.userId, messageId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error toggling star:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getStarredMessages = async (req: AuthRequest, res: Response) => {
  try {
    const result = await ChatService.getStarredMessages(req.user!.userId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting starred messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const togglePinChat = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const result = await ChatService.togglePinChat(req.user!.userId, chatId);
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error toggling pin chat:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const togglePinMessage = async (req: AuthRequest, res: Response) => {
  try {
    const messageId = req.params.messageId as string;
    const result = await ChatService.togglePinMessage(req.user!.userId, messageId);
    
    // Broadcast the pinned message state
    getIO().of('/chat').to(result.chatId).emit('message-pinned', result);
    
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error toggling pin message:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const updateDisappearingTimer = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { timer } = req.body;
    
    if (typeof timer !== 'number') {
      return res.status(400).json({ error: 'Timer (in seconds) is required' });
    }

    const result = await ChatService.updateDisappearingTimer(req.user!.userId, chatId, timer);

    // Broadcast socket event for disappearing timer update and system message
    const io = getIO().of('/chat');
    io.to(chatId).emit('disappearing-timer-updated', {
      chatId,
      disappearingTimer: result.disappearingTimer,
      systemMessage: result.systemMessage
    });

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error updating disappearing timer:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const scheduleMessageController = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { content, scheduledAt, type, mediaUrl, replyToId } = req.body;

    if (!content || !scheduledAt) {
      return res.status(400).json({ error: 'Content and scheduledAt date are required' });
    }

    const date = new Date(scheduledAt);
    if (isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const message = await ChatService.scheduleMessage(req.user!.userId, chatId, content, date, type, mediaUrl, replyToId);
    res.status(201).json(message);
  } catch (error: any) {
    console.error('Error scheduling message:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const getPendingScheduledMessagesController = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const messages = await ChatService.getPendingScheduledMessages(req.user!.userId, chatId);
    res.json(messages);
  } catch (error: any) {
    console.error('Error fetching scheduled messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const cancelScheduledMessageController = async (req: AuthRequest, res: Response) => {
  try {
    const messageId = req.params.messageId as string;
    const message = await ChatService.cancelScheduledMessage(req.user!.userId, messageId);
    res.json(message);
  } catch (error: any) {
    console.error('Error canceling scheduled message:', error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const transcribeAudioController = async (req: AuthRequest, res: Response) => {
  try {
    const messageId = req.params.messageId as string;
    const transcription = await transcribeVoiceNote(messageId);
    res.json({ success: true, transcription, messageId });
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    res.status(500).json({ error: error.message || 'Failed to transcribe audio' });
  }
};

export const summarizeChatController = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const clientMessages = req.body.messages;
    const summary = await summarizeChatMessages(chatId, limit, clientMessages);
    res.json(summary);
  } catch (error: any) {
    console.error('Error summarizing chat:', error);
    res.status(500).json({ error: error.message || 'Failed to summarize chat' });
  }
};

export const getSmartRepliesController = async (req: AuthRequest, res: Response) => {
  try {
    const { content, senderName, isOwnMessage } = req.body;
    if (!content) return res.status(400).json({ error: 'Message content is required' });
    const replies = await generateSmartReplies(content, senderName, isOwnMessage);
    res.json({ replies });
  } catch (error: any) {
    console.error('Error generating smart replies:', error);
    res.status(500).json({ error: error.message || 'Failed to generate smart replies' });
  }
};

export const handleAiPromptController = async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const response = await generateAIPrivateDraft(chatId || '', prompt, req.user?.userId || 'User');
    res.json({ response });
  } catch (error: any) {
    console.error('Error handling AI prompt:', error);
    res.status(500).json({ error: error.message || 'Failed to generate AI response' });
  }
};

export const translateMessageController = async (req: AuthRequest, res: Response) => {
  try {
    const { message, targetLanguage } = req.body;
    if (!message || !targetLanguage) {
      return res.status(400).json({ error: 'Message and targetLanguage are required' });
    }

    const cacheKey = `translation:${Buffer.from(message).toString('base64')}:${targetLanguage}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ translatedText: cached, fromCache: true });
    }

    // LibreTranslate URL (self-hosted or fallback)
    const LIBRE_TRANSLATE_URL = process.env.LIBRE_TRANSLATE_URL || 'http://localhost:5000';
    let translatedText = '';

    try {
      const response = await fetch(`${LIBRE_TRANSLATE_URL}/translate`, {
        method: 'POST',
        body: JSON.stringify({
          q: message,
          source: 'auto',
          target: targetLanguage,
          format: 'text',
          api_key: ''
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        translatedText = data.translatedText;
      } else {
        throw new Error('LibreTranslate error');
      }
    } catch (e) {
      // Fallback to Google Translate free API if self-hosted libretranslate is not running locally
      console.warn('LibreTranslate failed, falling back to Google Translate API...');
      try {
        const resFallback = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(message)}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
          }
        );
        const textFallback = await resFallback.text();
        try {
          const dataFallback = JSON.parse(textFallback);
          if (dataFallback && dataFallback[0]) {
            translatedText = dataFallback[0].map((chunk: any) => chunk[0]).join('');
          }
        } catch (e) {
          console.error('Failed to parse Google Translate response:', textFallback.substring(0, 200));
        }
      } catch (e: any) {
        console.error('Google Translate API fetch failed:', e);
      }
    }

    if (!translatedText) {
      return res.status(500).json({ error: 'Translation failed' });
    }

    // Cache for 24 hours
    await redis.setex(cacheKey, 86400, translatedText);

    res.json({ translatedText, fromCache: false });
  } catch (error: any) {
    console.error('Error translating message:', error);
    res.status(500).json({ error: error.message || 'Failed to translate message' });
  }
};