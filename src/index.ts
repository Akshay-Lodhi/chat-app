import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupSocket } from './socket';
import { PrismaClient } from '@prisma/client';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';
import liveRoutes from './routes/live.routes';

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

import uploadRoutes from './routes/upload.routes';

app.use("/api/auth", toNodeHandler(auth));
// We will phase out the old authRoutes slowly
app.use('/api/auth/legacy', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

setupSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.user.updateMany({
      data: { isOnline: false }
    });
    console.log('Reset online status for all users');
  } catch (error) {
    console.error('Failed to reset online status:', error);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log(`Server running on port ${PORT}`);
});
