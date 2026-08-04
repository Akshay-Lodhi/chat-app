import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { UploadService } from '../services/upload.service';

export class RecordingsController {
  static async getRecordings(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const recordings = await prisma.callRecording.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(recordings);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      return res.status(500).json({ error: 'Failed to fetch recordings' });
    }
  }

  static async uploadRecording(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const file = req.file;
      const type = req.body.type as 'AUDIO' | 'VIDEO';
      const duration = parseInt(req.body.duration) || 0;

      if (!file) {
        return res.status(400).json({ error: 'No recording file provided' });
      }

      // Upload to Cloudinary using UploadService
      const uploadResult = await UploadService.uploadFile(file.path, file.mimetype);

      // Save to database
      const recording = await prisma.callRecording.create({
        data: {
          userId,
          url: uploadResult.url,
          type: type || 'VIDEO',
          duration
        }
      });

      return res.json(recording);
    } catch (error) {
      console.error('Error uploading recording:', error);
      return res.status(500).json({ error: 'Failed to upload recording' });
    }
  }

  static async deleteRecording(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const id = req.params.id as string;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const recording = await prisma.callRecording.findUnique({
        where: { id }
      });

      if (!recording || recording.userId !== userId) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      // Optionally, delete from Cloudinary here (would need a method in UploadService)

      await prisma.callRecording.delete({
        where: { id }
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting recording:', error);
      return res.status(500).json({ error: 'Failed to delete recording' });
    }
  }
}
