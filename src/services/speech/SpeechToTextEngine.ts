/**
 * Contrato STT desacoplado (plan §26 / §41).
 * La UI solo conoce speechEngine.transcribe(uri), no si debajo está
 * Android SpeechRecognizer o Whisper local.
 * FASE 9: arquitectura preparada, sin activar Whisper aún.
 */

export type TranscriptionResult = {
  text: string;
};

export interface SpeechToTextEngine {
  isAvailable(): Promise<boolean>;
  transcribe(audioUri: string): Promise<TranscriptionResult>;
}
