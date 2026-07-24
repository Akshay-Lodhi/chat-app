import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { getActiveStreams, startLiveStream, endLiveStream } from '../controllers/live.controller';

const router = Router();

router.get('/active', requireAuth, getActiveStreams as any);
router.post('/start', requireAuth, startLiveStream as any);
router.post('/:id/end', requireAuth, endLiveStream as any);

export default router;
