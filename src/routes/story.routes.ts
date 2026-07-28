import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { createStory, getStories, viewStory, deleteStory } from '../controllers/story.controller';

const router = Router();

router.post('/', requireAuth, createStory as any);
router.get('/', requireAuth, getStories as any);
router.post('/:id/view', requireAuth, viewStory as any);
router.delete('/:id', requireAuth, deleteStory as any);

export default router;
