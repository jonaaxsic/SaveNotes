import { transcriptionService } from "@/services/transcriptionService";
import type { SpeechToTextEngine, TranscriptionResult } from "./SpeechToTextEngine";

/**
 * Engine actual: envuelve transcriptionService (expo-speech-recognition).
 * Respeta offline-first es-CL -> es-ES con fallback.
 * No toca grabación, solo transcribe archivo ya persistido.
 */
export class AndroidSpeechEngine implements SpeechToTextEngine {
  async isAvailable(): Promise<boolean> {
    return transcriptionService.isSupported();
  }

  async transcribe(audioUri: string): Promise<TranscriptionResult> {
    let text: string | null = null;
    try {
      text = await transcriptionService.transcribeAudioFile(audioUri, "es-CL");
    } catch (e: any) {
      if (String(e?.message ?? e).includes("language-not-supported")) {
        text = await transcriptionService.transcribeAudioFile(audioUri, "es-ES");
      } else {
        throw e;
      }
    }
    return { text: text?.trim() ?? "" };
  }
}

export const androidSpeechEngine = new AndroidSpeechEngine();
