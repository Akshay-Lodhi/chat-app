import { Server, Socket } from 'socket.io';
import { prisma } from '../../lib/prisma';
import { generateAIResponse } from '../../services/ai.service';
import * as cheerio from 'cheerio';

export const registerChatHandlers = (io: Server, socket: Socket, chatNamespace: any) => {
  const userId = socket.data.userId;

  socket.on('typing', ({ chatId, isTyping }) => {
    if (!chatId) return;
    socket.to(chatId).emit('typing', { chatId, userId, isTyping });
  });

  socket.on('send-message', async (data, callback) => {
    const { chatId, content, type, mediaUrl, tempId, replyToId, metadata, isEncrypted } = data;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { disappearingTimer: true }
    });

    const expiresAt = chat?.disappearingTimer && chat.disappearingTimer > 0
      ? new Date(Date.now() + chat.disappearingTimer * 1000)
      : null;

    const message = await prisma.message.create({
      data: { chatId, senderId: userId, content, type, mediaUrl, replyToId, metadata, expiresAt, isEncrypted: isEncrypted || false } as any,
      include: { replyTo: true, sender: true }
    });
    
    socket.to(chatId).emit('receive-message', message);
    
    if (typeof callback === 'function') {
      callback({ message, tempId });
    }

    // --- LINK PREVIEW EXTRACTION (Async) ---
    if (type === 'TEXT' && content && !isEncrypted) {
      const urlMatch = content.match(/(https?:\/\/[^\s]+)/g);
      if (urlMatch && urlMatch.length > 0) {
        const url = urlMatch[0];
        fetch(url, { headers: { 'User-Agent': 'NexusBot/1.0' } })
          .then(res => {
             const contentType = res.headers.get('content-type');
             if (contentType && contentType.includes('text/html')) {
               return res.text();
             }
             return null;
          })
          .then(async (html) => {
             if (!html) return;
             const $ = cheerio.load(html);
             const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
             const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
             let image = $('meta[property="og:image"]').attr('content') || '';
             
             if (image && image.startsWith('/')) {
               const urlObj = new URL(url);
               image = `${urlObj.protocol}//${urlObj.host}${image}`;
             }

             if (title || description || image) {
               const currentMeta = (metadata as any) || {};
               const newMetadata = { ...currentMeta, linkPreview: { title, description, image, url } };
               
               const updatedMessage = await prisma.message.update({
                 where: { id: message.id },
                 data: { metadata: newMetadata } as any,
                 include: { replyTo: true, sender: true }
               });

               chatNamespace.to(chatId).emit('message-updated', updatedMessage);
             }
          })
          .catch(err => console.error('Failed to fetch link preview:', err));
      }
    }

    // --- NEXUS AI INTEGRATION ---
    try {
      const chatWithUsers = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { participants: true }
      });

      if (chatWithUsers) {
        const isAiInChat = chatWithUsers.participants.some((p: any) => p.userId === 'nexus-ai-system');
        const isAiMentioned = Boolean(content && /@(ai|nexusai)\b/i.test(content));
        
        if (isAiInChat || isAiMentioned) {
          chatNamespace.to(chatId).emit('typing', { chatId, isTyping: true, userId: 'nexus-ai-system' });
          
          const aiReply = await generateAIResponse(chatId, content || '', message.sender.name || 'User');
          
          await prisma.messageStatus.upsert({
            where: { messageId_userId: { messageId: message.id, userId: 'nexus-ai-system' } },
            update: { status: 'READ' },
            create: { messageId: message.id, userId: 'nexus-ai-system', status: 'READ' }
          });
          chatNamespace.to(message.senderId).emit('message-status-update', { 
            messageId: message.id, status: 'READ', by: 'nexus-ai-system', chatId, time: new Date() 
          });

          chatNamespace.to(chatId).emit('typing', { chatId, isTyping: false, userId: 'nexus-ai-system' });

          const aiMessage = await prisma.message.create({
            data: { chatId, senderId: 'nexus-ai-system', content: aiReply, type: 'TEXT' },
            include: { replyTo: true, sender: true }
          });

          chatNamespace.to(chatId).emit('receive-message', aiMessage);
        }
      }
    } catch (aiError) {
      console.error('Failed to process AI response:', aiError);
    }
  });

  socket.on('delete-message', async ({ messageId, chatId }) => {
    try {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (msg && msg.senderId === userId) {
        await prisma.message.update({
          where: { id: messageId },
          data: { isDeleted: true, content: null, mediaUrl: null }
        });
        chatNamespace.to(chatId).emit('message-deleted', { messageId, chatId });
        socket.emit('message-deleted', { messageId, chatId });
      }
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  });

  socket.on('message-delivered', async ({ messageId, chatId }) => {
    try {
      const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true } });
      if (!msg) return;

      const statusRecord = await prisma.messageStatus.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { status: 'DELIVERED' },
        create: { messageId, userId, status: 'DELIVERED' }
      });
      chatNamespace.to(msg.senderId).emit('message-status-update', { messageId, status: 'DELIVERED', by: userId, chatId, time: statusRecord.updatedAt });
    } catch (err) {}
  });

  socket.on('message-read', async ({ messageId, chatId }) => {
    try {
      const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true } });
      if (!msg) return;

      const statusRecord = await prisma.messageStatus.upsert({
        where: { messageId_userId: { messageId, userId } },
        update: { status: 'READ' },
        create: { messageId, userId, status: 'READ' }
      });
      chatNamespace.to(msg.senderId).emit('message-status-update', { messageId, status: 'READ', by: userId, chatId, time: statusRecord.updatedAt });
    } catch (err) {}
  });

  socket.on('chat-read', async ({ chatId }) => {
    try {
      const unread = await prisma.message.findMany({
        where: { 
          chatId, 
          senderId: { not: userId },
          NOT: { statuses: { some: { userId, status: 'READ' } } }
        },
        select: { id: true, senderId: true }
      });

      for (const msg of unread) {
        await prisma.messageStatus.upsert({
          where: { messageId_userId: { messageId: msg.id, userId } },
          update: { status: 'READ' },
          create: { messageId: msg.id, userId, status: 'READ' }
        });
        chatNamespace.to(msg.senderId).emit('message-status-update', { messageId: msg.id, status: 'READ', by: userId, chatId });
      }
    } catch (err) {}
  });

  socket.on('message-reaction', async ({ messageId, chatId, reaction }) => {
    try {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg) return;
      
      let reactions = msg.reactions ? (msg.reactions as Record<string, any>) : {};
      const existing = reactions[userId];
      const existingEmoji = typeof existing === 'string' ? existing : existing?.emoji;

      if (existingEmoji === reaction) {
        delete reactions[userId]; 
      } else {
        reactions[userId] = { emoji: reaction, timestamp: new Date().toISOString() };
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { reactions: reactions as any }
      });

      chatNamespace.to(chatId).emit('message-reaction-update', { messageId, chatId, reactions });

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { participants: true }
      });
      if (chat) {
        chat.participants.forEach((p: any) => {
          if (p.userId !== userId) {
            chatNamespace.to(p.userId).emit('message-reaction-update', { messageId, chatId, reactions });
          }
        });
      }
    } catch (err) {
      console.error('Failed to update reaction', err);
    }
  });

  socket.on('edit-message', async (data: { messageId: string, content: string, chatId: string }) => {
    try {
      const { messageId, content, chatId } = data;
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg) return;

      if (msg.senderId !== userId) return;
      
      const now = new Date();
      const diffMs = now.getTime() - new Date(msg.createdAt).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins > 15) {
        socket.emit('error', 'Message can only be edited within 15 minutes of sending');
        return;
      }

      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: { content, isEdited: true } as any,
        include: { replyTo: true, sender: true }
      });

      chatNamespace.to(chatId).emit('message-updated', updatedMessage);
    } catch (err) {
      console.error('Error editing message:', err);
    }
  });

  socket.on('vote-poll', async ({ messageId, optionId, chatId }) => {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId }
      });
      
      if (message && (message.type as any) === 'POLL' && (message as any).metadata) {
        const meta = (message as any).metadata as any;
        if (meta.poll && meta.poll.options) {
          let userVotedOptionId: string | null = null;
          meta.poll.options.forEach((opt: any) => {
            if (opt.votes && opt.votes.includes(userId)) {
              userVotedOptionId = opt.id;
            }
          });

          if (userVotedOptionId === optionId) {
             const option = meta.poll.options.find((o: any) => o.id === optionId);
             if (option && option.votes) {
               option.votes = option.votes.filter((id: string) => id !== userId);
             }
          } else {
             if (!meta.poll.multipleAnswers && userVotedOptionId) {
                const oldOption = meta.poll.options.find((o: any) => o.id === userVotedOptionId);
                if (oldOption && oldOption.votes) {
                  oldOption.votes = oldOption.votes.filter((id: string) => id !== userId);
                }
             }
             
             const newOption = meta.poll.options.find((o: any) => o.id === optionId);
             if (newOption) {
               if (!newOption.votes) newOption.votes = [];
               if (!newOption.votes.includes(userId)) {
                 newOption.votes.push(userId);
               }
             }
          }

          const updatedMessage = await prisma.message.update({
            where: { id: messageId },
            data: { metadata: meta } as any,
            include: { replyTo: true, sender: true }
          });
          
          chatNamespace.to(chatId).emit('message-updated', updatedMessage);
        }
      }
    } catch (err) {
      console.error('Error voting on poll:', err);
    }
  });
};
