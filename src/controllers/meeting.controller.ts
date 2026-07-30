import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { prisma } from '../lib/prisma';

export const createMeetingController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, callType, requiresApproval } = req.body || {};

    // Generate readable random code: meet-9842-xyza
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const randomAlpha = Math.random().toString(36).substring(2, 6);
    const code = `meet-${randomNum}-${randomAlpha}`;

    const meeting = await (prisma as any).meeting.create({
      data: {
        code,
        title: title || 'Instant Nexus Meeting',
        hostId: userId,
        callType: callType === 'AUDIO' ? 'AUDIO' : 'VIDEO',
        requiresApproval: requiresApproval !== undefined ? Boolean(requiresApproval) : true
      },
      include: {
        host: {
          select: { id: true, name: true, profilePicture: true, phoneNumber: true }
        }
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    res.json({
      meeting,
      code: meeting.code,
      meetingUrl: `${frontendUrl}/join/${meeting.code}`
    });
  } catch (error: any) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: error.message || 'Failed to create meeting' });
  }
};

export const getMeetingInfoController = async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.code as string;
    if (!code) {
      return res.status(400).json({ error: 'Meeting code is required' });
    }

    const meeting = await (prisma as any).meeting.findUnique({
      where: { code },
      include: {
        host: {
          select: { id: true, name: true, profilePicture: true, phoneNumber: true }
        }
      }
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found or invalid link' });
    }

    res.json(meeting);
  } catch (error: any) {
    console.error('Error getting meeting info:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch meeting info' });
  }
};

export const endMeetingController = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const code = req.params.code as string;

    const meeting = await (prisma as any).meeting.findUnique({ where: { code } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (meeting.hostId !== userId) {
      return res.status(403).json({ error: 'Only the host can end this meeting' });
    }

    const updated = await (prisma as any).meeting.update({
      where: { code },
      data: {
        isActive: false,
        endedAt: new Date()
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error ending meeting:', error);
    res.status(500).json({ error: error.message || 'Failed to end meeting' });
  }
};
