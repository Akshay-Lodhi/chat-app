import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middlewares/auth.middleware';
import { uploadMedia } from '../controllers/upload.controller';

const router = Router();

// Configure Multer for temp storage
const upload = multer({ dest: 'uploads/' });

// Upload route
router.post('/', requireAuth, upload.single('file'), uploadMedia as any);

export default router;
