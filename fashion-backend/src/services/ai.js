const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Fashion AI System Prompts ─────────────────────────────────────────────

const FASHION_SYSTEM_EN = `You are an elite fashion advisor for Fashion.co.tz, a premium Tanzanian fashion platform.
You have deep expertise in African fashion, global trends, fabric selection, color theory, and styling.
Provide specific, actionable, luxurious fashion advice. Reference African fabrics like kitenge, kanga, and ankara when relevant.
Be warm, encouraging, and highly professional. Respond in clear, elegant English.`;

const FASHION_SYSTEM_SW = `Wewe ni mshauri mkubwa wa mitindo kwa Fashion.co.tz, jukwaa la mitindo la Tanzania.
Una ujuzi wa kina katika mitindo ya Afrika, mwelekeo wa kimataifa, uchaguzi wa vitambaa, nadharia ya rangi, na mtindo.
Toa ushauri wa mitindo wa kipekee, wa vitendo, na wa heshima. Kumbuka vitambaa vya Afrika kama vile kitenge, kanga, na ankara.
Kuwa mwenye joto, msisimue, na mtaalamu sana. Jibu kwa Kiswahili cha wazi na kistaarabu.`;

/**
 * Generate a clothing design using DALL-E 3
 */
async function generateDesign({ prompt, inspirationImageUrl }) {
  // Build an enhanced design prompt
  const enhancedPrompt = `Fashion design illustration: ${prompt}.
Style: Professional fashion sketch with watercolor or digital art aesthetic.
Show the garment on a fashion illustration figure.
Include fabric texture details, elegant lines, and color details.
Premium, high-end fashion magazine quality. White or neutral background.
Do not include text or watermarks.`;

  const imageResponse = await openai.images.generate({
    model: 'dall-e-3',
    prompt: enhancedPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'hd',
    style: 'vivid',
  });

  const imageUrl = imageResponse.data[0].url;

  // Generate description, fabrics, and color palette using GPT-4
  const analysisMessages = [
    {
      role: 'system',
      content: FASHION_SYSTEM_EN,
    },
  ];

  if (inspirationImageUrl) {
    analysisMessages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I've designed a fashion item based on this prompt: "${prompt}" and the provided inspiration image.
Please provide:
1. A compelling 2-3 sentence description of this design
2. A JSON array of 3-5 recommended fabrics with brief explanations (format: [{"name":"...", "reason":"..."}])
3. A JSON array of 5-6 hex color codes that form a beautiful palette for this design (format: [{"hex":"#...","name":"..."}])

Respond in this exact JSON format:
{
  "description": "...",
  "fabrics": [{"name":"...","reason":"..."}],
  "colorPalette": [{"hex":"...","name":"..."}]
}`,
        },
        { type: 'image_url', image_url: { url: inspirationImageUrl } },
      ],
    });
  } else {
    analysisMessages.push({
      role: 'user',
      content: `I've designed a fashion item with this prompt: "${prompt}".
Please provide:
1. A compelling 2-3 sentence description of this design
2. A JSON array of 3-5 recommended fabrics with brief explanations (format: [{"name":"...", "reason":"..."}])
3. A JSON array of 5-6 hex color codes that form a beautiful palette for this design (format: [{"hex":"#...","name":"..."}])

Respond in this exact JSON format:
{
  "description": "...",
  "fabrics": [{"name":"...","reason":"..."}],
  "colorPalette": [{"hex":"...","name":"..."}]
}`,
    });
  }

  const analysisResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: analysisMessages,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  let analysisData;
  try {
    analysisData = JSON.parse(analysisResponse.choices[0].message.content);
  } catch {
    analysisData = {
      description: `A stunning fashion design inspired by: ${prompt}`,
      fabrics: [{ name: 'Silk', reason: 'Luxurious drape and sheen' }],
      colorPalette: [{ hex: '#C9A96E', name: 'Gold' }],
    };
  }

  return {
    imageUrl,
    description: analysisData.description,
    fabrics: analysisData.fabrics || [],
    colorPalette: analysisData.colorPalette || [],
  };
}

/**
 * Generate a smart outfit recommendation
 */
async function recommendOutfit({ occasion, weather, stylePreference, language = 'en' }) {
  const systemPrompt = language === 'sw' ? FASHION_SYSTEM_SW : FASHION_SYSTEM_EN;

  const userMessage = language === 'sw'
    ? `Ninapanga kwenda: ${occasion}. Hali ya hewa: ${weather}. Mtindo wangu: ${stylePreference}.
Toa pendekezo kamili la mavazi likiwa na:
1. Mavazi kamili (kila kipande)
2. Rangi zinazolingana
3. Vifaa (begi, mapambo, kofia, nk.)
4. Viatu

Jibu kwa muundo huu wa JSON:
{
  "outfit": {"top":"...","bottom":"...","outerwear":"...","description":"..."},
  "colors": [{"hex":"...","name":"...","role":"..."}],
  "accessories": ["..."],
  "shoes": {"style":"...","color":"...","description":"..."},
  "stylingTips": ["...","...","..."]
}`
    : `I'm attending: ${occasion}. Weather: ${weather}. My style: ${stylePreference}.
Please provide a complete outfit recommendation including:
1. Full outfit (each piece)
2. Matching colors
3. Accessories (bag, jewelry, hat, etc.)
4. Shoes

Respond in this exact JSON format:
{
  "outfit": {"top":"...","bottom":"...","outerwear":"...","description":"..."},
  "colors": [{"hex":"...","name":"...","role":"..."}],
  "accessories": ["..."],
  "shoes": {"style":"...","color":"...","description":"..."},
  "stylingTips": ["...","...","..."]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  let data;
  try {
    data = JSON.parse(response.choices[0].message.content);
  } catch {
    data = {
      outfit: { description: `Elegant outfit for ${occasion}` },
      colors: [],
      accessories: [],
      shoes: { style: 'Classic heels', color: 'Nude' },
      stylingTips: [],
    };
  }

  return data;
}

/**
 * Chat with the bilingual AI fashion assistant
 */
async function chatWithAssistant({ message, history = [], language = 'auto' }) {
  // Detect language if auto
  let detectedLanguage = language;
  if (language === 'auto') {
    // Simple heuristic: if message contains common Swahili words, use Swahili
    const swahiliIndicators = ['nini', 'ninahitaji', 'tafadhali', 'nguo', 'mtindo', 'nina', 'wewe', 'mimi', 'je', 'habari', 'sasa', 'nataka'];
    const lowerMsg = message.toLowerCase();
    detectedLanguage = swahiliIndicators.some(w => lowerMsg.includes(w)) ? 'sw' : 'en';
  }

  const systemPrompt = detectedLanguage === 'sw' ? FASHION_SYSTEM_SW : FASHION_SYSTEM_EN;

  // Build message history (last 10 turns for context)
  const recentHistory = history.slice(-10).map(turn => ({
    role: turn.role,
    content: turn.content,
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: message },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.85,
    max_tokens: 800,
  });

  return {
    response: response.choices[0].message.content,
    language: detectedLanguage,
  };
}

/**
 * Analyze a designer's portfolio piece and provide AI feedback
 */
async function analyzeDesignerWork({ imageUrl, title, description }) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: FASHION_SYSTEM_EN },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Please analyze this fashion design titled "${title}".${description ? ` Designer's description: ${description}` : ''}

Provide detailed professional feedback covering:
1. Strengths of the design
2. Areas for improvement
3. Market positioning suggestions
4. Styling recommendations
5. Fabric and color suggestions

Be specific, constructive, and encouraging. Aim for 150-200 words.`,
          },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return response.choices[0].message.content;
}

module.exports = { generateDesign, recommendOutfit, chatWithAssistant, analyzeDesignerWork };
