import type { SpeechToTextEngine, TranscriptionResult } from "./SpeechToTextEngine";

/**
 * Placeholder para Whisper local 100% offline (plan §24-27).
 * NO implementar hasta que FASE 1-8 esté estable y la prueba modo avión
 * demuestre que Android SpeechRecognizer no es offline real.
 *
 * Cuando se active, este engine hará:
 *   m4a (reproducción) -> wav temporal PCM16 -> whisper.cpp -> text -> borrar temp
 * Sin backend, sin API key, sin internet.
 */
export class WhisperLocalEngine implements SpeechToTextEngine {
  async isAvailable(): Promise<boolean> {
    // Retornará true cuando whisper.cpp esté integrado y modelo descargado
    return false;
  }

  async transcribe(_audioUri: string): Promise<TranscriptionResult> {
    throw new Error("WhisperLocalEngine no implementado aún — usar AndroidSpeechEngine. Ver plan §25.");
  }
}
