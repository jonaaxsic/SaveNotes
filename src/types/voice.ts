export type VoiceRecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "saving"
  | "completed"
  | "error";

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
