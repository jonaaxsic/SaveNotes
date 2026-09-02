import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from "expo-speech-recognition";

/**
 * On-device STT via expo-speech-recognition (SFSpeechRecognizer / SpeechRecognizer).
 * No API key, no backend. Uses the OS engine.
 *
 * Two modes:
 * - transcribeAudioFile(uri): file-based (wav/mp3/ogg 16kHz). OS transcribes the file.
 * - Web fallback: expo-speech-recognition polyfills Web Speech API, so same module works on web.
 */

let pendingResolve: ((text: string | null) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let currentUri: string | null = null;
let resultListener: { remove: () => void } | null = null;
let errorListener: { remove: () => void } | null = null;
let endListener: { remove: () => void } | null = null;
let hasDelivered = false;

function cleanupListeners() {
  try {
    resultListener?.remove();
  } catch {}
  try {
    errorListener?.remove();
  } catch {}
  try {
    endListener?.remove();
  } catch {}
  resultListener = null;
  errorListener = null;
  endListener = null;
}

function resetPending() {
  pendingResolve = null;
  pendingReject = null;
  currentUri = null;
  hasDelivered = false;
}

export const transcriptionService = {
  isSupported(): boolean {
    if (Platform.OS === "web") return true; // polyfilled by expo-speech-recognition
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  },

  async isAvailable(): Promise<boolean> {
    try {
      if (Platform.OS === "web") return true;
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  },

  /**
   * Transcribe an audio file on-device.
   * Returns transcript text or null if nothing recognized.
   * Throws on hard error (e.g. file not found, language not supported).
   */
  async transcribeAudioFile(uri: string, lang: string = "es-ES"): Promise<string | null> {
    if (!uri) throw new Error("transcribeAudioFile: uri is empty");

    // Cleanup any previous session
    try {
      await ExpoSpeechRecognitionModule.abort();
    } catch {}
    cleanupListeners();
    resetPending();

    currentUri = uri;

    return new Promise<string | null>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;

      let finalTranscript = "";

      resultListener = ExpoSpeechRecognitionModule.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
        try {
          const text = event.results?.[0]?.transcript?.trim() ?? "";
          if (text) finalTranscript = text;
          if (event.isFinal && text) {
            finalTranscript = text;
          }
        } catch {}
      });

      errorListener = ExpoSpeechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        const code = (event as any)?.error ?? "unknown";
        const msg = (event as any)?.message ?? String(code);
        // no-speech is not fatal — return null instead of throwing
        if (code === "no-speech" || code === "aborted") {
          cleanupListeners();
          const r = pendingResolve;
          resetPending();
          r?.(finalTranscript || null);
          return;
        }
        cleanupListeners();
        const rej = pendingReject;
        resetPending();
        rej?.(new Error(msg || code));
      });

      endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
        if (hasDelivered) return;
        hasDelivered = true;
        cleanupListeners();
        const r = pendingResolve;
        const text = finalTranscript || null;
        resetPending();
        r?.(text);
      });

      // Start file-based recognition
      // Note: requiresOnDeviceRecognition true on iOS is fast and private.
      // On Android, on-device may need offline model installed; we use hybrid (false) with fallback.
      const requiresOnDevice = Platform.OS === "ios";
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: false,
        continuous: false,
        requiresOnDeviceRecognition: requiresOnDevice,
        addsPunctuation: true,
        // Supported: 16000hz PCM wav / mp3 / ogg per docs. expo-audio m4a may need fallback.
        audioSource: {
          uri,
          // @ts-ignore — types vary by version
          audioChannels: 1,
          sampleRate: 16000,
        },
      });
      // Safety timeout: if OS never fires end/error (e.g. unsupported format), resolve after 12s
      setTimeout(() => {
        if (hasDelivered) return;
        hasDelivered = true;
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {}
        cleanupListeners();
        const r = pendingResolve;
        resetPending();
        // Return whatever we got, even if null — caller will handle retry message
        r?.(finalTranscript || null);
      }, 12000);
    });
  },

  async cancel(): Promise<void> {
    try {
      await ExpoSpeechRecognitionModule.abort();
    } catch {}
    cleanupListeners();
    resetPending();
  },

  async destroy(): Promise<void> {
    await this.cancel();
  },
};
