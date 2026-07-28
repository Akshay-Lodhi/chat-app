import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Initialize the Gemini API client
// We initialize it lazily in case the API key is not immediately available

export const generateAIResponse = async (chatId: string, userMessage: string, senderName: string): Promise<string> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }

    // Fetch the last 10 messages from the chat for context
    const recentMessages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { sender: true }
    });

    const conversationHistory = recentMessages.reverse().map(msg => {
      const isAI = msg.senderId === 'nexus-ai-system';
      return `${msg.sender.name}: ${msg.content}`;
    }).join('\n');

    const prompt = `
You are Nexus AI, an intelligent, friendly, and helpful chat assistant integrated into the NexusChat messaging app. 
You are currently chatting with users in a chat room. You can answer questions, summarize messages, and engage in friendly banter.
Keep your answers relatively concise, as this is a mobile chat interface. Use emojis occasionally.

Here is the recent conversation history in this chat room for context:
${conversationHistory}

User (${senderName}) just said: "${userMessage}"
Your reply:`.trim();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Gemini API Error:', errBody);
      throw new Error('Failed to fetch from Gemini API');
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      return text.trim();
    } else {
      throw new Error('No valid response from AI');
    }
  } catch (error) {
    console.error('Error generating AI response:', error);
    return "Sorry, my AI core is currently offline or experiencing issues. Please make sure the Gemini API key is properly configured.";
  }
};
