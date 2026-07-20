import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupSocket } from './socket';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://chat-app-two-khaki-va269vxf6w.vercel.app'
].filter(Boolean) as string[];

app.use(cors({ origin: allowedOrigins, credentials: true })); // Required for Better Auth cookies
app.use(express.json());

import uploadRoutes from './routes/upload.routes';

app.use("/api/auth", toNodeHandler(auth));
// We will phase out the old authRoutes slowly
app.use('/api/auth/legacy', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

setupSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
