import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { getMe, updateProfile, getContacts, getBlockedUsers, blockUser, unblockUser, reportUser } from '../controllers/user.controller';

const router = Router();

// Get current user profile
router.get('/me', requireAuth, getMe as any);

// Update profile
router.put('/profile', requireAuth, updateProfile as any);

// Get user contacts
router.get('/contacts', requireAuth, getContacts as any);

// Block/Report routes
router.get('/blocked', requireAuth, getBlockedUsers as any);
router.post('/block/:id', requireAuth, blockUser as any);
router.delete('/block/:id', requireAuth, unblockUser as any);
router.post('/report/:id', requireAuth, reportUser as any);

export default router;
