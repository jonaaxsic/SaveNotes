export type VoiceRecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "saving"
  | "completed"
  | "error";

/**
 * Unified recorder hook state for waveform pipeline (§5).
 * idle → recording → processing → idle/error
 * Kept separate from VoiceRecordingStatus for backward compat.
 */
export type VoiceRecorderState = "idle" | "recording" | "processing" | "error";

export type SpeechSessionResult = {
  transcript: string;
  audioUri: string;
  durationMs: number;
};

export type VoiceSessionErrorCode =
  | "permission-denied"
  | "recognition-unavailable"
  | "recording-unsupported"
  | "no-speech"
  | "audio-not-saved"
  | "recognition-failed"
  | "unknown";

/**
 * Extended error codes per §37 — deterministic, no transcript.startsWith fallback.
 * Includes AUDIO_URI_MISSING and validation codes for reproducible 10-recording criteria:
 * URI!=null, duration>0, file exists, size>0.
 */
export type VoiceErrorCode =
  | VoiceSessionErrorCode
  | "AUDIO_URI_MISSING"
  | "audio-uri-missing"
  | "audio-not-found"
  | "audio-empty"
  | "invalid-duration"
  | "storage-failed"
  | "transcription-failed";

export type AudioRecorderResult = {
  uri: string;
  durationMs: number;
};

export class VoiceSessionError extends Error {
  code: VoiceSessionErrorCode;
  cause?: unknown;
  constructor(code: VoiceSessionErrorCode, message?: string, cause?: unknown) {
    super(message ?? code);
    this.code = code;
    this.cause = cause;
    this.name = "VoiceSessionError";
  }
}

export type VoiceUiError = {
  code: VoiceSessionErrorCode;
  message: string;
};
