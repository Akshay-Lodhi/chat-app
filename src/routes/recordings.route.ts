import { Router } from 'express';
import { RecordingsController } from '../controllers/recordings.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Ensure temp upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for temporary storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `recording-${Date.now()}-${Math.round(Math.random() * 1E9)}.webm`);
  }
});

const upload = multer({ storage });

router.use(requireAuth);

router.get('/', RecordingsController.getRecordings);
router.post('/', upload.single('file'), RecordingsController.uploadRecording);
router.delete('/:id', RecordingsController.deleteRecording);

export default router;
