import { Response } from 'express';
import { getIO } from '../socket';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ChatService } from '../services/chat.service';

export const getChats = async (req: AuthRequest, res: Response) => {
  try {
    const chats = await ChatService.getChatsForUser(req.user!.userId);
    res.json(chats);
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
    res.json(chat);
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

    const messages = await ChatService.getMessagesForChat(chatId, limit, cursor);
    res.json(messages);
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
    res.json(chat);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Server error' });
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
    const { deleteFor } = req.body; // 'me' | 'everyone'
    const result = await ChatService.deleteMessage(req.user!.userId, messageId, deleteFor || 'everyone');
    
    if (result.deletedForEveryone) {
      getIO().of('/chat').to(result.chatId).emit('message-deleted', {
        messageId,
        chatId: result.chatId,
        deleteFor: 'everyone',
        deletedAt: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};

export const clearChatMessages = async (req: AuthRequest, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    await ChatService.clearChatMessages(req.user!.userId, chatId);
    const io = getIO();
    io.to(`chat_${chatId}`).emit('chat-cleared', { chatId });
    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message || 'Server error' });
  }
};
