import { prisma } from '../lib/prisma';

const getApiKey = () => {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() && !process.env.GEMINI_API_KEY.includes('your_gemini_api_key')) {
    return process.env.GEMINI_API_KEY;
  }
};

// Valid Gemini API v1beta model identifiers supported by the API Key
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-omni-flash-preview',
  'gemini-flash-latest'
];

/**
 * Universal Gemini API fetcher using the exact REST endpoint & headers requested.
 * Includes automatic rate-limit backoff & multi-model fallback chain.
 */
export const callGeminiContentApi = async (parts: any[]): Promise<string> => {
  const apiKey = getApiKey();

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': apiKey
          } as Record<string, string>,
          body: JSON.stringify({
            contents: [{ parts }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && text.trim()) {
            return text.trim();
          }
        } else {
          // If model is not found (404), skip quietly to next model
          if (response.status === 404) {
            break;
          }
          // If rate limited (429), wait 1.5s before retrying
          if (response.status === 429 && attempt === 0) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          break;
        }
      } catch (err) {
        break;
      }
    }
  }

  throw new Error('All Gemini API model attempts failed.');
};

export const getLocalSmartReplies = (messageContent: string): string[] => {
  const lower = (messageContent || '').toLowerCase();
  if (lower.includes('morning') || lower.includes('gm')) {
    return ["Good morning! ☀️", "Morning! Have a great day 😊", "GM! 👋"];
  }
  if (lower.includes('night') || lower.includes('gn')) {
    return ["Good night! 😴", "Sweet dreams! 🌙", "Night! 👋"];
  }
  if (lower.includes('thank') || lower.includes('thx') || lower.includes('ty')) {
    return ["You're welcome! 😊", "Anytime! 👍", "My pleasure! 🙌"];
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return ["Hey there! 👋", "Hello! How are you?", "Hi! What's up?"];
  }
  if (lower.includes('call') || lower.includes('meet') || lower.includes('join')) {
    return ["Sure, let's connect! 📞", "Give me 5 mins", "I'll join now 👍"];
  }
  if (lower.includes('ok') || lower.includes('okay') || lower.includes('done')) {
    return ["Great! 👍", "Awesome 😊", "Sounds good!"];
  }
  if (lower.endsWith('?')) {
    return ["Yes, absolutely! 👍", "Let me check and let you know", "Not sure yet 🤔"];
  }
  return ["Sounds good! 👍", "Got it, thanks!", "Let's do that! 😊"];
};

export const generateAIResponse = async (chatId: string, userMessage: string, senderName: string): Promise<string> => {
  let conversationHistory = '';
  try {
    const recentMessages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { sender: true }
    });

    conversationHistory = recentMessages.reverse().map((msg: any) => {
      return `${msg.sender.name}: ${msg.content}`;
    }).join('\n');
  } catch (e) {}

  const prompt = `
You are Nexus AI, the official, highly intelligent, and friendly chat assistant for NexusChat.

### Conversation Context
${conversationHistory}

The user you are replying to is: ${senderName}
They just said: "${userMessage}"

Write your best, most helpful, and natural reply to ${senderName} below:
`.trim();

  try {
    return await callGeminiContentApi([{ text: prompt }]);
  } catch (err) {
    console.error('generateAIResponse error:', err);
    return "I'm receiving a high volume of requests right now! Please wait a moment and try asking me again. 🚀";
  }
};

export const generateSmartReplies = async (messageContent: string, senderName?: string): Promise<string[]> => {
  const prompt = `
Given the chat message: "${messageContent}" from ${senderName || 'a contact'},
Generate 3 short, natural, conversational reply suggestions (1 to 4 words each).
Respond ONLY with a valid JSON array of 3 strings. Example: ["Sounds great! 👍", "I'll check now", "Thanks!"]
Do not add markdown formatting or code block backticks.
`.trim();

  try {
    let rawText = await callGeminiContentApi([{ text: prompt }]);
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 3).map(s => String(s).trim());
    }
  } catch (err) {
    console.warn('Smart replies API call failed, using dynamic local engine:', err);
  }

  return getLocalSmartReplies(messageContent);
};

export const transcribeVoiceNote = async (messageId: string): Promise<string> => {
  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!message) throw new Error('Message not found');

  const existingMeta = (message.metadata as any) || {};
  if (existingMeta.transcription && typeof existingMeta.transcription === 'string' && !existingMeta.transcription.includes('unavailable')) {
    return existingMeta.transcription;
  }

  const mediaUrl = message.mediaUrl;
  if (!mediaUrl) throw new Error('No media URL found for this voice note');

  let text = '';
  try {
    const audioRes = await fetch(mediaUrl);
    if (!audioRes.ok) throw new Error('Failed to download audio file');
    const arrayBuffer = await audioRes.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    let mimeType = (message as any).mimeType || 'audio/webm';
    if (mediaUrl.endsWith('.ogg')) mimeType = 'audio/ogg';
    if (mediaUrl.endsWith('.mp3')) mimeType = 'audio/mp3';
    if (mediaUrl.endsWith('.wav')) mimeType = 'audio/wav';

    const promptText = "Listen to this voice message carefully and transcribe the spoken words into clear, accurate text. Output ONLY the transcribed text, with no additional commentary or markdown formatting.";

    text = await callGeminiContentApi([
      { text: promptText },
      { inline_data: { mime_type: mimeType, data: base64Data } }
    ]);
  } catch (err) {
    console.error('Error transcribing audio with Gemini:', err);
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

  try {
    let rawText = await callGeminiContentApi([{ text: prompt }]);
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(rawText);
    return parsed;
  } catch (err) {
    console.error('Error summarizing chat:', err);
    return {
      mainTopic: "Chat Summary",
      summary: "Overview of recent chat conversation.",
      keyPoints: messages.slice(0, 3).map((m: any) => `${m.sender?.name || 'User'}: ${m.content || ''}`.substring(0, 60)),
      decisions: []
    };
  }
};
