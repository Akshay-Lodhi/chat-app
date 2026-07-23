import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    phoneNumber: string;
    name?: string;
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

    // Fallback for Incognito mode / Cross-site 3rd party cookie blocking
    if (!session) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token && token !== 'better-auth-session') {
          const dbSession = await prisma.session.findUnique({
            where: { token },
            include: { user: true }
          });

          if (dbSession && dbSession.expiresAt > new Date()) {
            session = {
              session: dbSession as any,
              user: dbSession.user as any
            };
          }
        }
      }
    }

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }

    req.user = {
      userId: session.user.id,
      phoneNumber: (session.user as any).phoneNumber || '',
      name: session.user.name || undefined
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};
