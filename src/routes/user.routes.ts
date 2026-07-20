import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { getMe, updateProfile, getContacts } from '../controllers/user.controller';

const router = Router();

// Get current user profile
router.get('/me', requireAuth, getMe as any);

// Update profile
router.put('/profile', requireAuth, updateProfile as any);

// Get user contacts
router.get('/contacts', requireAuth, getContacts as any);

export default router;
