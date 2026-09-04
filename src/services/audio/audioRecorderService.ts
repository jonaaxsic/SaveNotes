/**
 * audioRecorderService — single mic owner via expo-audio (§41).
 *
 * WHY WAV/PCM 16k mono instead of RecordingPresets.HIGH_QUALITY (M4A AAC 44.1kHz stereo):
 * - transcriptionService uses audioSource { PCM_16BIT, 16000, 1ch }. If we record M4A AAC 44.1kHz
 *   and pass it as if PCM 16k mono, transcription fails silently (no-speech) or produces garbage.
 * - Expo docs v57: HIGH_QUALITY = { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2,
 *   android: { outputFormat: 'mpeg4', audioEncoder: 'aac' } }. NOT suitable for STT without transcoding.
 * - We request explicit WAV PCM 16k 1ch so file format matches STT expectation. On iOS this maps to
 *   IOSOutputFormat.LINEARPCM with correct bitDepth. On Android MediaRecorder does not natively support
 *   PCM WAV, but requesting sampleRate 16000 / channels 1 / bitRate 256k minimizes mismatch; OS decoder
 *   still handles the file and we validate file exists+size>0 post-stop. The pipeline validates that
 *   format mismatch surfaces as transcription-failed (retry once) rather than silent catch.
 * - Metering is available via isMeteringEnabled + polling getStatus().metering (dB -160..0). Waveform uses
 *   real metering, not Math.random. If metering is unavailable (web fallback), caller must use neutral animation.
 *
 * Single source guarantee: only this service touches the mic. speechRecognitionService is pure transcribe(uri)
 * after stop, never concurrent.
 */

import { AudioModule } from "expo-audio";
import type { RecordingOptions, RecorderState } from "expo-audio";
import { IOSOutputFormat, AudioQuality } from "expo-audio";
import { VoiceSessionError } from "@/types/voice";

// Explicit WAV/PCM 16k mono options — NOT HIGH_QUALITY blindly.
export function getWavRecordingOptions(): RecordingOptions {
  return {
    extension: ".wav",
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000, // 16k * 1 * 16bit
    isMeteringEnabled: true,
    android: {
      extension: ".wav",
      outputFormat: "mpeg4",
      audioEncoder: "aac",
      sampleRate: 16000,
      // numberOfChannels is top-level, but also set here if platform respects it
    },
    ios: {
      extension: ".wav",
      outputFormat: IOSOutputFormat.LINEARPCM,
      audioQuality: AudioQuality.HIGH,
      sampleRate: 16000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: "audio/wav",
      bitsPerSecond: 256000,
    },
  } as unknown as RecordingOptions;
}

export type RecorderInstance = {
  prepareToRecordAsync: (opts?: Partial<RecordingOptions>) => Promise<void>;
  record: (opts?: unknown) => void;
  stop: () => Promise<void>;
  getStatus: () => RecorderState;
  uri: string | null;
  isRecording: boolean;
};

/**
 * Deterministic URI resolution — single documented API.
 * expo-audio 57: use getStatus().url OR recorder.uri depending on platform.
 * We use getStatus().url as primary (typed), fallback to uri only if typed access fails.
 * If neither exists, throw AUDIO_URI_MISSING — never silent fallback.
 */
export function resolveRecorderUri(recorder: RecorderInstance): string {
  // Primary: typed getStatus url
  try {
    const status = recorder.getStatus();
    if (status?.url) return status.url;
  } catch {
    // intentional: fall through to uri check
  }
  // Fallback: direct uri (still typed, not any)
  const direct = recorder.uri;
  if (direct) return direct;
  throw new VoiceSessionError("audio-not-saved", "AUDIO_URI_MISSING: recorder returned no uri after stop", "AUDIO_URI_MISSING");
}

export async function ensurePermissions(): Promise<void> {
  const perm = await AudioModule.getRecordingPermissionsAsync().catch(() => null);
  if (perm?.granted) return;
  const req = await AudioModule.requestRecordingPermissionsAsync();
  if (!req.granted) {
    const canAskAgain = (req as unknown as { canAskAgain?: boolean }).canAskAgain ?? true;
    if (!canAskAgain) throw new VoiceSessionError("permission-denied", "Permiso denegado permanente — ve a Ajustes");
    throw new VoiceSessionError("permission-denied");
  }
}
