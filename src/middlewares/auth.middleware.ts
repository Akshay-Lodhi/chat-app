import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    phoneNumber: string;
    name?: string;
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    });

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
