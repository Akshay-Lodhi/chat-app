import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { UserService } from '../services/user.service';
import { getIO } from '../socket';
import { prisma } from '../lib/prisma';

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await UserService.getUserById(req.user!.userId);
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, about, profilePicture, publicKey } = req.body;
    const user = await UserService.updateProfile(req.user!.userId, { name, about, profilePicture, publicKey });

    if (publicKey) {
      try {
        const userChats = await prisma.chatParticipant.findMany({
          where: { userId: req.user!.userId },
          select: { chatId: true }
        });
        const io = getIO().of('/chat');
        userChats.forEach(c => {
          io.to(c.chatId).emit('user-updated', { userId: req.user!.userId, publicKey });
        });
      } catch (err) {
        console.error('Failed to broadcast public key update', err);
      }
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getContacts = async (req: AuthRequest, res: Response) => {
  try {
    const phone = req.query.phone as string;
    const users = await UserService.getContacts(req.user!.userId, phone);
    return res.json(users);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const blockUser = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });
    
    await UserService.blockUser(req.user!.userId, id as string);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const unblockUser = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'User ID is required' });
    
    await UserService.unblockUser(req.user!.userId, id as string);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const reportUser = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!id) return res.status(400).json({ error: 'User ID is required' });
    
    await UserService.reportUser(req.user!.userId, id as string, reason);
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const getBlockedUsers = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const users = await UserService.getBlockedUsers(req.user!.userId);
    return res.json(users);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const uploadPublicKey = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ error: 'Public key is required' });

    await UserService.updateProfile(req.user!.userId, { publicKey });
    
    // Broadcast key update to active chats
    try {
      const userChats = await prisma.chatParticipant.findMany({
        where: { userId: req.user!.userId },
        select: { chatId: true }
      });
      const io = getIO().of('/chat');
      userChats.forEach(c => {
        io.to(c.chatId).emit('user-updated', { userId: req.user!.userId, publicKey });
      });
    } catch (err) {
      console.error('Failed to broadcast public key update', err);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Upload key error', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const getPublicKey = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { userId } = req.params;
    const user = await UserService.getUserById(userId as string);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    return res.json({ publicKey: user.publicKey });
  } catch (error) {
    console.error('Get key error', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
