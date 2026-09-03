import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { setupSocket } from './socket';
import { prisma } from './lib/prisma';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';
import liveRoutes from './routes/live.routes';
import storyRoutes from './routes/story.routes';
import meetingRoutes from './routes/meeting.routes';
import recordingsRoutes from './routes/recordings.route';

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://chat-app-two-khaki-va269vxf6w.vercel.app'
].filter(Boolean) as string[];

app.use(cors({ 
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  }, 
  credentials: true 
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(compression());

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middlewares/error.middleware';
import { logger } from './lib/logger';
import uploadRoutes from './routes/upload.routes';

// Apply rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Apply Helmet for security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Required for loading media across domains
}));

// Request logging middleware
app.use((req, res, next) => {
  if (req.path !== '/health') {
    logger.info(`Incoming Request: ${req.method} ${req.url}`);
  }
  next();
});

app.use("/api/auth", toNodeHandler(auth));
// We will phase out the old authRoutes slowly
app.use('/api/auth/legacy', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/recordings', recordingsRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Global error handler middleware
app.use(errorHandler);

setupSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  try {
    await prisma.user.updateMany({
      data: { isOnline: false }
    });
    console.log('Reset online status for all users');
  } catch (error) {
    console.error('Failed to reset online status:', error);
  }
  
  console.log(`Server running on port ${PORT}`);
});
