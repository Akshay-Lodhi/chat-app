import { Response } from 'express';
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
