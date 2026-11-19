import { GoogleGenAI, Type } from '@google/genai';
import { getLanguageConfig } from '../../shared/languages.ts';

function getClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim().length < 10) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  return getClient() !== null;
}

export interface FarmContextPayload {
  farmerName?: string;
  fieldName?: string;
  locationLabel?: string;
  country?: string;
  region?: string;
  cropName?: string;
  growthStage?: string;
  soilType?: string;
  irrigationMethod?: string;
  weatherSummary?: string;
  forecastSummary?: string;
  waterSummary?: string;
  activeAlertsSummary?: string;
  recentScanSummary?: string;
}

export async function generateAgriAssistantReply(params: {
  question: string;
  languageCode: string;
  context: FarmContextPayload;
}): Promise<{
  answer: string;
  provider: string;
  isFallback: boolean;
  error?: string;
}> {
  const lang = getLanguageConfig(params.languageCode);
  const langName = lang ? `${lang.label} (${lang.nativeLabel})` : params.languageCode;
  const ai = getClient();

  const contextBlock = [
    `Farmer: ${params.context.farmerName || 'Farmer'}`,
    `Field: ${params.context.fieldName || 'Not selected'}`,
    `Location: ${params.context.locationLabel || 'Not specified'} (${params.context.country || 'Global'})`,
    `Crop & Growth Stage: ${params.context.cropName || 'Not specified'} — ${params.context.growthStage || 'Not specified'}`,
    `Soil & Irrigation: ${params.context.soilType || 'Unknown'} / ${params.context.irrigationMethod || 'Unknown'}`,
    `Live Weather: ${params.context.weatherSummary || 'Unavailable'}`,
    `7-Day Forecast: ${params.context.forecastSummary || 'Unavailable'}`,
    `Standing Water Level: ${params.context.waterSummary || 'No manual water measurements recorded'}`,
    `Active Risk Alerts: ${params.context.activeAlertsSummary || 'None'}`,
    `Recent Crop Scan: ${params.context.recentScanSummary || 'None'}`,
  ].join('\n');

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Farmer Question: ${params.question}\n\nAvailable Grounded Field Context:\n${contextBlock}`,
        config: {
          systemInstruction:
            `You are AgroAlert AI, an expert agronomist and agricultural weather advisor. ` +
            `Answer strictly using the grounded field context provided. Do NOT invent or fabricate weather metrics, water levels, or soil sensor readings that are not present in the context; if data is missing or unavailable, explicitly state that it is unavailable. ` +
            `Clearly distinguish measured conditions from forecast predictions. ` +
            `Respond completely in ${langName} (${params.languageCode}). Use natural, clear, farmer-friendly language suitable for both reading and voice playback (plain prose, concise 3–6 sentences or clear numbered actions without markdown asterisks).`,
        },
      });
      const text = response.text?.trim();
      if (text) {
        return {
          answer: text,
          provider: 'gemini-4-hydrogen',
          isFallback: false,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini request failed';
      return {
        answer: buildRuleBasedReply(params.question, params.context, params.languageCode),
        provider: 'rule-based-fallback',
        isFallback: true,
        error: msg,
      };
    }
  }

  return {
    answer: buildRuleBasedReply(params.question, params.context, params.languageCode),
    provider: 'rule-based-fallback',
    isFallback: true,
    error: 'Gemini API key is not configured on the server.',
  };
}

function buildRuleBasedReply(
  question: string,
  ctx: FarmContextPayload,
  languageCode: string
): string {
  const prefix =
    languageCode === 'en-IN' || languageCode === 'en-US' || languageCode === 'en-GB'
      ? '[Rule-Based Guidance Fallback — Gemini AI unavailable] '
      : `[Rule-Based Fallback (${languageCode} translation requires Gemini API)] `;

  const parts: string[] = [];
  if (ctx.fieldName && ctx.cropName) {
    parts.push(`Field "${ctx.fieldName}" (${ctx.locationLabel || 'location'}) is growing ${ctx.cropName} at ${ctx.growthStage || 'current'} stage.`);
  }
  if (ctx.weatherSummary && !ctx.weatherSummary.includes('Unavailable')) {
    parts.push(`Observed weather: ${ctx.weatherSummary}.`);
  } else {
    parts.push('Live weather data is currently unavailable for this request.');
  }
  if (ctx.waterSummary) {
    parts.push(`Water status: ${ctx.waterSummary}.`);
  }
  if (ctx.activeAlertsSummary && ctx.activeAlertsSummary !== 'None') {
    parts.push(`Active alerts: ${ctx.activeAlertsSummary}.`);
  } else {
    parts.push('No critical RED/ORANGE weather risks are currently flagged from available records.');
  }
  if (question.toLowerCase().includes('rain')) {
    parts.push('Check drainage outlets before predicted rain and avoid spraying fertilizers or pesticides immediately ahead of heavy rainfall.');
  } else if (question.toLowerCase().includes('heat')) {
    parts.push('During high temperatures, schedule irrigation in early morning or late evening and inspect sensitive flowering stages for heat stress.');
  } else {
    parts.push('Inspect field drainage, monitor standing water manually, and review the 7-day forecast before field operations.');
  }
  return prefix + parts.join(' ');
}


export async function translateTextWithGemini(
  text: string,
  targetLanguageCode: string
): Promise<{
  translatedText: string;
  provider: string;
  isFallback: boolean;
}> {
  // Check for empty input
  if (!text || !text.trim()) {
    return {
      translatedText: '',
      provider: 'none',
      isFallback: false,
    };
  }

  // English does not require translation
  if (targetLanguageCode.toLowerCase().startsWith('en')) {
    return {
      translatedText: text,
      provider: 'native',
      isFallback: false,
    };
  }

  // Get selected language configuration
  const lang = getLanguageConfig(targetLanguageCode);

  const langName = lang
    ? `${lang.label} (${lang.nativeLabel})`
    : targetLanguageCode;

  // Initialize Gemini
  const ai = getClient();

  if (!ai) {
    console.error(
      '[Translation] Gemini client unavailable. Check server API key configuration.'
    );

    return {
      translatedText: text,
      provider: 'untranslated-fallback',
      isFallback: true,
    };
  }

  try {
    console.log(
      `[Translation] Starting translation into ${langName} (${targetLanguageCode})`
    );

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',

      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                `You are a professional agricultural translator. ` +
                `Translate the following agricultural alert or advisory accurately into ${langName}. ` +
                `The target language code is ${targetLanguageCode}. ` +
                `IMPORTANT INSTRUCTIONS: ` +
                `1. Write the complete translation in the target language's native script. ` +
                `2. Do not return the original English text. ` +
                `3. Preserve all numbers, measurements, units, crop names, and safety warnings. ` +
                `4. Use natural language that farmers can easily understand. ` +
                `5. Do not add explanations or commentary. ` +
                `6. Return ONLY the translated text.\n\n` +
                `Original text:\n${text}`,
            },
          ],
        },
      ],
    });

    const translatedText = response.text?.trim();

    if (!translatedText) {
      console.error(
        '[Translation] Gemini returned an empty translation.'
      );

      return {
        translatedText: text,
        provider: 'untranslated-fallback',
        isFallback: true,
      };
    }

    console.log(
      `[Translation] Translation successful for ${targetLanguageCode}`
    );

    return {
      translatedText,
      provider: 'gemini-4-hydrogen',
      isFallback: false,
    };

  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown Gemini translation error';

    console.error(
      `[Translation] Gemini request failed for ${targetLanguageCode}:`,
      errorMessage
    );

    return {
      translatedText: text,
      provider: 'untranslated-fallback',
      isFallback: true,
    };
  }
}

// ==========================================
// GEMINI CROP IMAGE ANALYSIS
// ==========================================

export async function analyzeCropImageWithGemini(params: {
  base64Data: string;
  mimeType: string;
  selectedCropName: string;
  growthStage: string;
  locationLabel: string;
  languageCode: string;
}): Promise<{
  identifiedCrop: string;
  symptoms: string[];
  possibleIssues: string[];
  uncertaintyNote: string;
  recommendations: string[];
  provider: string;
}> {
  const fallback = {
    identifiedCrop: params.selectedCropName,
    symptoms: [] as string[],
    possibleIssues: ['Image analysis unavailable'],
    uncertaintyNote:
      'AI image analysis could not be completed. Please consult an agricultural expert.',
    recommendations: [
      'Take a clear photograph of the affected crop.',
      'Inspect the leaves, stems and surrounding plants.',
    ],
    provider: 'rule-based-fallback',
  };

  const ai = getClient();
  if (!ai) return fallback;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: params.mimeType,
                data: params.base64Data,
              },
            },
            {
              text:
                `Analyze this crop image for agricultural health issues. ` +
                `Selected crop: ${params.selectedCropName}. ` +
                `Growth stage: ${params.growthStage}. ` +
                `Location: ${params.locationLabel}. ` +
                `Respond in language ${params.languageCode}. ` +
                `Identify visible symptoms, possible issues and practical recommendations. ` +
                `Do not claim a disease is confirmed from an image alone. ` +
                `If the image is unclear, state the uncertainty. ` +
                `Return ONLY valid JSON with these fields: ` +
                `identifiedCrop (string), symptoms (array of strings), ` +
                `possibleIssues (array of strings), uncertaintyNote (string), ` +
                `recommendations (array of strings).`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            identifiedCrop: { type: Type.STRING },
            symptoms: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            possibleIssues: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            uncertaintyNote: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'identifiedCrop',
            'symptoms',
            'possibleIssues',
            'uncertaintyNote',
            'recommendations',
          ],
        },
      },
    });

    const raw = response.text?.trim();
    if (!raw) return fallback;

    const result = JSON.parse(raw);

    return {
      identifiedCrop: String(result.identifiedCrop || params.selectedCropName),
      symptoms: Array.isArray(result.symptoms) ? result.symptoms.map(String) : [],
      possibleIssues: Array.isArray(result.possibleIssues)
        ? result.possibleIssues.map(String)
        : [],
      uncertaintyNote: String(result.uncertaintyNote || ''),
      recommendations: Array.isArray(result.recommendations)
        ? result.recommendations.map(String)
        : [],
      provider: 'gemini-4-hydrogen',
    };
  } catch (error) {
    console.error('[Crop Analysis] Gemini error:', error);
    return fallback;
  }
}


// ==========================================
// GEMINI AUDIO TRANSCRIPTION
// ==========================================

export async function transcribeAudioWithGemini(params: {
  base64Audio: string;
  mimeType: string;
  languageCode: string;
}): Promise<{
  transcript: string;
  provider: string;
  error?: string;
}> {
  const ai = getClient();

  if (!ai) {
    return {
      transcript: '',
      provider: 'none',
      error: 'Gemini API key is not configured.',
    };
  }

  try {
    const lang = getLanguageConfig(params.languageCode);
    const langName = lang
      ? `${lang.label} (${lang.nativeLabel})`
      : params.languageCode;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: params.mimeType,
                data: params.base64Audio,
              },
            },
            {
              text:
                `Transcribe the spoken audio accurately. ` +
                `The expected language is ${langName} (${params.languageCode}). ` +
                `Return only the spoken words in their original language and script. ` +
                `Do not translate or add explanations.`,
            },
          ],
        },
      ],
    });

    const transcript = response.text?.trim() || '';

    return {
      transcript,
      provider: 'gemini-3.5-transcribe',
      ...(transcript ? {} : { error: 'Gemini returned an empty transcript.' }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown transcription error';

    console.error('[Speech Recognition] Gemini error:', message);

    return {
      transcript: '',
      provider: 'gemini-3.5-transcribe',
      error: message,
    };
  }
}


// ==========================================
// GEMINI TEXT-TO-SPEECH
// ==========================================

function createWavBuffer(
  pcmData: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

export async function generateSpeechWithGemini(params: {
  text: string;
  languageCode: string;
}): Promise<{
  audioBase64: string;
  mimeType: string;
  provider: string;
  voiceName: string;
  error?: string;
}> {
  const ai = getClient();

  if (!ai) {
    return {
      audioBase64: '',
      mimeType: 'audio/wav',
      provider: 'none',
      voiceName: '',
      error: 'Gemini API key is not configured.',
    };
  }

  try {
    const lang = getLanguageConfig(params.languageCode);
    if (!lang) {
      throw new Error(`Unsupported language: ${params.languageCode}`);
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                `Speak the following text naturally and clearly in the language ` +
                `${lang.label} (${params.languageCode}). ` +
                `Do not translate, summarize or change the text. ` +
                `Text to speak: ${params.text}`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Kore',
            },
          },
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((part) => part.inlineData?.data);

    if (!audioPart?.inlineData?.data) {
      throw new Error('Gemini did not return audio data.');
    }

    const audioBase64 = audioPart.inlineData.data;
    const originalMimeType = audioPart.inlineData.mimeType || '';

    let audioBuffer = Buffer.from(audioBase64, 'base64');
    let mimeType = originalMimeType;

    // Gemini commonly returns raw PCM audio. Wrap it in a WAV header.
    if (originalMimeType.toLowerCase().includes('l16')) {
      const rateMatch = originalMimeType.match(/rate=(\d+)/i);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;

      audioBuffer = createWavBuffer(audioBuffer, sampleRate);
      mimeType = 'audio/wav';
    } else if (!originalMimeType.toLowerCase().includes('wav')) {
      throw new Error(
        `Unexpected Gemini audio format: ${originalMimeType || 'unknown'}`
      );
    }

    return {
      audioBase64: audioBuffer.toString('base64'),
      mimeType,
      provider: 'gemini-3.8-flash-lite-tts',
      voiceName: 'Kore',
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown speech generation error';

    console.error('[Gemini TTS] Generation failed:', message);

    return {
      audioBase64: '',
      mimeType: 'audio/wav',
      provider: 'gemini-3.8-flash-lite-tts',
      voiceName: 'Kore',
      error: message,
    };
  }
}
