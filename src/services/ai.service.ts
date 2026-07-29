import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../lib/prisma';

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

    const conversationHistory = recentMessages.reverse().map((msg: any) => {
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

export const transcribeVoiceNote = async (messageId: string): Promise<string> => {
  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!message) throw new Error('Message not found');

  const existingMeta = (message.metadata as any) || {};
  // Return cached transcription if it exists and is not an error string from a previous attempt
  if (
    existingMeta.transcription && 
    !existingMeta.transcription.toLowerCase().includes('unable to access') &&
    !existingMeta.transcription.toLowerCase().includes('failed') &&
    !existingMeta.transcription.toLowerCase().includes('unavailable')
  ) {
    return existingMeta.transcription;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const audioUrl = message.mediaUrl || message.content;
  if (!audioUrl) {
    throw new Error('No audio file found for this message');
  }

  let base64Audio = '';
  let mimeType = 'audio/webm';

  try {
    if (audioUrl.startsWith('data:')) {
      const parts = audioUrl.split(',');
      const match = parts[0].match(/data:(.*?);base64/);
      if (match) mimeType = match[1];
      base64Audio = parts[1];
    } else if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      const audioRes = await fetch(audioUrl, { redirect: 'follow' });
      if (!audioRes.ok) throw new Error(`Failed to fetch audio file (${audioRes.status})`);
      const arrayBuffer = await audioRes.arrayBuffer();
      base64Audio = Buffer.from(arrayBuffer).toString('base64');
      const contentType = audioRes.headers.get('content-type');
      if (contentType) {
        if (contentType.includes('ogg')) mimeType = 'audio/ogg';
        else if (contentType.includes('mp3') || contentType.includes('mpeg')) mimeType = 'audio/mp3';
        else if (contentType.includes('wav')) mimeType = 'audio/wav';
        else if (contentType.includes('m4a') || contentType.includes('mp4')) mimeType = 'audio/mp4';
        else mimeType = 'audio/webm';
      }
    }
  } catch (err) {
    console.error('Error fetching audio bytes for Gemini transcription:', err);
  }

  let parts: any[] = [];
  if (base64Audio) {
    parts = [
      {
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: base64Audio
        }
      },
      {
        text: "Please transcribe this voice message accurately into text. If the speaker speaks in Hindi, Hinglish, or English, write down the exact spoken words clearly. Return only the transcription text without extra preamble."
      }
    ];
  } else {
    parts = [
      {
        text: `Please transcribe this audio note clearly. File reference: ${audioUrl}`
      }
    ];
  }

  const models = ['gemini-1.5-flash', 'gemini-flash-latest'];
  let text = '';

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey
        },
        body: JSON.stringify({ contents: [{ parts }] })
      });

      if (response.ok) {
        const data = await response.json();
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        if (text) break;
      } else {
        const errText = await response.text();
        console.warn(`Gemini model ${model} response failed:`, errText);
      }
    } catch (e) {
      console.warn(`Gemini model ${model} fetch exception:`, e);
    }
  }

  if (!text) {
    text = "Voice note transcription unavailable.";
  }

  const updatedMeta = { ...existingMeta, transcription: text };
  await prisma.message.update({
    where: { id: messageId },
    data: { metadata: updatedMeta }
  });

  return text;
};

export const summarizeChatMessages = async (chatId: string, limit = 50) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { name: true, isGroup: true }
  });

  const messages = await prisma.message.findMany({
    where: {
      chatId,
      type: { not: 'SYSTEM' as any },
      deletedForEveryone: false
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { sender: { select: { name: true } } }
  });

  if (messages.length === 0) {
    return {
      summary: "No messages available to summarize.",
      mainTopic: "Empty Chat",
      keyPoints: [],
      decisions: []
    };
  }

  const history = messages.reverse().map((m: any) => `${m.sender?.name || 'User'}: ${m.content || '[Media/File]'}`).join('\n');

  const prompt = `You are Nexus AI Chat Summarizer.
Analyze the following recent chat history (${messages.length} messages) from "${chat?.name || 'Chat'}":
---
${history}
---

Provide a structured summary in strictly valid JSON format with the following keys:
{
  "mainTopic": "Short title describing the main subject of conversation",
  "summary": "2-3 sentence overview of what was discussed",
  "keyPoints": ["Bullet point 1", "Bullet point 2"],
  "decisions": ["Decision/action item agreed upon"]
}
Return ONLY the JSON string without code block backticks.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    throw new Error('Gemini API call failed');
  }

  const data = await response.json();
  let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  
  rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(rawText);
  } catch (e) {
    return {
      mainTopic: "Chat Summary",
      summary: rawText,
      keyPoints: [rawText],
      decisions: []
    };
  }
};
