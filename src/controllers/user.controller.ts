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
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
