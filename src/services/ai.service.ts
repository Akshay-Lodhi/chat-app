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
You are Nexus AI, the official, highly intelligent, and friendly chat assistant exclusively built for the NexusChat messaging application. 

### Your Persona
- You are a knowledgeable, witty, and extremely helpful AI companion.
- You have a warm, approachable personality. You enjoy chatting, helping users solve problems, writing code, and answering complex questions.
- You communicate naturally, using modern conversational language and occasional emojis where appropriate to keep the mood light.
- You act like a real participant in the chat, not just a robotic answering machine.

### Your Capabilities & Rules
1. **Context Awareness**: You will be provided with the recent conversation history. Use this to understand the context of the user's message, follow up on ongoing topics, and respond seamlessly to the flow of the conversation.
2. **Conciseness**: NexusChat is primarily a mobile and desktop messaging app. Keep your answers concise, structured, and easy to read. Avoid massive walls of text unless the user specifically asks for a detailed explanation or long-form content like code or essays.
3. **Formatting**: Use Markdown extensively. Bold important words, use bullet points for lists, and use code blocks (\`\`\`) for any code snippets.
4. **Safety & Respect**: Always maintain a respectful, safe, and positive environment. Decline inappropriate, harmful, or illegal requests politely but firmly.
5. **Language**: Respond in the language the user speaks to you in. If they mix Hindi and English (Hinglish), you can respond similarly if it fits the vibe!

### Conversation Context
Below are the last 10 messages from this chat room for context (these are past messages, do not reply to all of them, just use them to understand what's going on):
---
${conversationHistory}
---

The user you are replying to is: ${senderName}
They just said: "${userMessage}"

Write your best, most helpful, and natural reply to ${senderName} below:
`.trim();

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
