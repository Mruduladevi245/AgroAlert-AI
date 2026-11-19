import { getLanguageConfig, SUPPORTED_LANGUAGES } from '../../shared/languages.ts';
import {
  generateSpeechWithGemini,
  isGeminiConfigured,
  transcribeAudioWithGemini,
} from './gemini.ts';

export interface LanguageCapabilityStatus {
  code: string;
  label: string;
  nativeLabel: string;
  rtl: boolean;
  translationAvailable: boolean;
  translationProvider: string;
  sttServerAvailable: boolean;
  sttProvider: string;
  browserSttHint: boolean;
  ttsServerAvailable: boolean;
  ttsProvider: string;
  googleCloudVoices: string[];
  geminiTtsAvailable: boolean;
}

function isGoogleCloudTtsConfigured(): boolean {
  const key = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  return Boolean(key && key.trim().length > 10);
}

export function getVoiceLanguageCapabilities(): {
  languages: LanguageCapabilityStatus[];
  providers: {
    googleCloudTts: boolean;
    geminiTts: boolean;
    geminiStt: boolean;
    geminiTranslation: boolean;
  };
} {
  const cloudTts = isGoogleCloudTtsConfigured();
  const gemini = isGeminiConfigured();

  const languages: LanguageCapabilityStatus[] = SUPPORTED_LANGUAGES.map((lang) => {
    const hasCloudVoice = cloudTts && lang.googleCloudTtsVoices.length > 0;
    const hasGeminiTts = gemini && lang.geminiTtsSupported;

    return {
      code: lang.code,
      label: lang.label,
      nativeLabel: lang.nativeLabel,
      rtl: Boolean(lang.rtl),
      translationAvailable: lang.code.startsWith('en') || gemini,
      translationProvider: lang.code.startsWith('en')
        ? 'Native'
        : gemini
          ? 'Gemini 4 Hydrogen'
          : 'Unavailable (browser fallback only)',
      sttServerAvailable: gemini,
      sttProvider: gemini ? 'Gemini 3.5 Transcribe' : 'Browser Web Speech fallback',
      browserSttHint: lang.browserSttSupportedHint,
      ttsServerAvailable: hasCloudVoice || hasGeminiTts,
      ttsProvider: hasCloudVoice
        ? 'Google Cloud TTS'
        : hasGeminiTts
          ? 'Gemini 3.8 TTS'
          : 'Browser SpeechSynthesis fallback',
      googleCloudVoices: hasCloudVoice ? lang.googleCloudTtsVoices : [],
      geminiTtsAvailable: hasGeminiTts,
    };
  });

  return {
    languages,
    providers: {
      googleCloudTts: cloudTts,
      geminiTts: gemini,
      geminiStt: gemini,
      geminiTranslation: gemini,
    },
  };
}

export async function synthesizeSpeech(params: {
  text: string;
  languageCode: string;
  voicePreference?: string;
}): Promise<
  | {
      ok: true;
      audioBuffer: Buffer;
      mimeType: string;
      provider: string;
      voiceUsed: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      fallbackToBrowser: boolean;
    }
> {
  const text = params.text.trim();
  if (!text) {
    return {
      ok: false,
      status: 400,
      error: 'Text is required for speech generation.',
      fallbackToBrowser: false,
    };
  }
  if (text.length > 3000) {
    return {
      ok: false,
      status: 400,
      error: 'Text exceeds 3000 character speech generation limit.',
      fallbackToBrowser: false,
    };
  }

  const lang = getLanguageConfig(params.languageCode);
  if (!lang) {
    return {
      ok: false,
      status: 400,
      error: `Language "${params.languageCode}" is not in the supported voice registry.`,
      fallbackToBrowser: false,
    };
  }

  // 1. Preferred Provider: Google Cloud Text-to-Speech (when configured & voice exists for locale)
  const cloudKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (cloudKey && cloudKey.trim().length > 10 && lang.googleCloudTtsVoices.length > 0) {
    const chosenVoice =
      params.voicePreference && lang.googleCloudTtsVoices.includes(params.voicePreference)
        ? params.voicePreference
        : lang.googleCloudTtsVoices[0];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(cloudKey.trim())}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: lang.bcp47,
              name: chosenVoice,
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 1.0,
            },
          }),
        }
      );
      clearTimeout(timer);

      if (resp.ok) {
        const data = (await resp.json()) as { audioContent?: string };
        if (data.audioContent) {
          return {
            ok: true,
            audioBuffer: Buffer.from(data.audioContent, 'base64'),
            mimeType: 'audio/mpeg',
            provider: 'google-cloud-tts',
            voiceUsed: chosenVoice,
          };
        }
      }
    } catch {
      // Fall through to Gemini TTS if configured
    }
  }

  // 2. Gemini 3.8 TTS (server-side WAV output)
  let ttsDetail = '';
  if (isGeminiConfigured() && lang.geminiTtsSupported) {
    const geminiAudio = await generateSpeechWithGemini({
      text,
      languageCode: lang.code,
    });
    if (geminiAudio.audioBase64) {
      return {
        ok: true,
        audioBuffer: Buffer.from(geminiAudio.audioBase64, 'base64'),
        mimeType: geminiAudio.mimeType,
        provider: geminiAudio.provider,
        voiceUsed: geminiAudio.voiceName,
      };
    }
    ttsDetail = geminiAudio.error || '';
  }

  // 3. Explicit unavailable response (never fake audio!)
  return {
    ok: false,
    status: 503,
    error: `Server-side TTS provider is unavailable for ${lang.label}.${ttsDetail ? ` (${ttsDetail})` : ''} Use matching browser speech synthesis if installed.`,
    fallbackToBrowser: true,
  };
}

export async function recognizeSpeech(params: {
  base64Audio: string;
  mimeType: string;
  languageCode: string;
}): Promise<{
  ok: boolean;
  transcript: string;
  provider: string;
  error?: string;
}> {
  const lang = getLanguageConfig(params.languageCode);
  if (!lang) {
    return {
      ok: false,
      transcript: '',
      provider: 'none',
      error: `Unsupported language code: ${params.languageCode}`,
    };
  }
  const result = await transcribeAudioWithGemini({
    base64Audio: params.base64Audio,
    mimeType: params.mimeType,
    languageCode: lang.code,
  });
  return {
    ok: Boolean(result.transcript),
    transcript: result.transcript,
    provider: result.provider,
    error: result.error,
  };
}
