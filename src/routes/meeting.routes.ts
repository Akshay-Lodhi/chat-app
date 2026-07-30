import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  createMeetingController,
  getMeetingInfoController,
  endMeetingController
} from '../controllers/meeting.controller';

const router = Router();

// Create new instant meeting (Auth required)
router.post('/create', requireAuth, createMeetingController as any);

// Public / Guest get meeting details by code
router.get('/:code', getMeetingInfoController as any);

// End meeting (Host Auth required)
router.post('/:code/end', requireAuth, endMeetingController as any);

export default router;
