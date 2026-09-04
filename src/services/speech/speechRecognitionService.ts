/**
 * speechRecognitionService — pure transcribe(uri) AFTER stop (§41)
 *
 * No interim UI, no concurrent mic usage. Called only after audioStorageService.persist().
 * Uses transcriptionService (expo-speech-recognition file-based). Retries once for transient errors
 * only; never retries for permission/format hard failures (§22).
 */

import { Platform } from "react-native";
import { VoiceSessionError } from "@/types/voice";
import { transcriptionService } from "@/services/transcriptionService";

export type TranscribeResult = {
  text: string;
  engine: string | null;
};

function isHardFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("permission") ||
    m.includes("not-allowed") ||
    m.includes("language-not-supported") ||
    m.includes("service-not-allowed") ||
    m.includes("recording-unsupported") ||
    m.includes("audio-not-saved") ||
    m.includes("audio-not-found") ||
    m.includes("audiouri") ||
    m.includes("encoding")
  );
}

export async function transcribeAudioFile(uri: string, lang: string = "es-CL"): Promise<TranscribeResult> {
  if (!uri) throw new VoiceSessionError("audio-not-saved", "AUDIO_URI_MISSING", "AUDIO_URI_MISSING");

  const engine =
    Platform.OS === "android" ? (transcriptionService.pickAndroidServicePackage() ?? null) : null;

  let lastError: string | null = null;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      if (attempt === 1) {
        // Single transient retry with minimal backoff (no arbitrary sleep as fix, just jitter)
        await new Promise<void>((r) => setTimeout(r, 600));
        console.info("[STT] retry attempt 1 for", uri.slice(-30));
      }

      let text: string | null = null;
      try {
        text = await transcriptionService.transcribeAudioFile(uri, lang);
      } catch (e: unknown) {
        const em = String((e as { message?: string })?.message ?? e);
        // es-CL not installed on many devices → try es-ES as documented offline-first fallback
        if (em.includes("language-not-supported")) {
          console.info("[STT] es-CL not supported, trying es-ES");
          text = await transcriptionService.transcribeAudioFile(uri, "es-ES");
        } else {
          throw e;
        }
      }

      const trimmed = text?.trim() ?? "";
      if (trimmed) {
        console.info("[STT] transcribed", { engine: engine ?? "(default)", length: trimmed.length });
        return { text: trimmed, engine };
      }

      // Empty result: treat as no-speech (not hard failure) but allow one retry
      lastError = "no-speech";
      if (attempt < 1) continue;
      throw new VoiceSessionError("no-speech", "No se detectó voz — intenta hablar más cerca del micrófono", "no-speech");
    } catch (e: unknown) {
      if (e instanceof VoiceSessionError) throw e;
      const em = String((e as { message?: string })?.message ?? e);
      lastError = em;
      console.warn(`[STT] attempt ${attempt} failed:`, em);
      if (isHardFailure(em)) {
        throw new VoiceSessionError("recognition-failed", em, e);
      }
      if (attempt === 1) throw new VoiceSessionError("recognition-failed", em, e);
      // else loop will retry once
    }
  }
  throw new VoiceSessionError("recognition-failed", lastError ?? "unknown", lastError);
}

// Backward compat: keep service object for legacy imports
export const speechRecognitionService = {
  transcribe: transcribeAudioFile,
};
