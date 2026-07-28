import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import { createStory, getStories, viewStory, deleteStory, likeStory, unlikeStory } from '../controllers/story.controller';

const router = Router();

router.post('/', requireAuth, createStory as any);
router.get('/', requireAuth, getStories as any);
router.post('/:id/view', requireAuth, viewStory as any);
router.post('/:id/like', requireAuth, likeStory as any);
router.delete('/:id/like', requireAuth, unlikeStory as any);
router.delete('/:id', requireAuth, deleteStory as any);

export default router;
