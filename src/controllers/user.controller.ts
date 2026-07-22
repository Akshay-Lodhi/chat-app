import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { UserService } from '../services/user.service';

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
    const { name, about, profilePicture } = req.body;
    const user = await UserService.updateProfile(req.user!.userId, { name, about, profilePicture });
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
