import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from "expo-speech-recognition";
import { VoiceSessionError } from "@/types/voice";
import type { SpeechSessionResult } from "@/types/voice";

export interface SpeechRecognizer {
  start(options: { lang?: string; onInterim?: (text: string) => void }): Promise<void>;
  stop(): Promise<SpeechSessionResult>;
  abort(): Promise<void>;
}

export class ExpoSpeechRecognizer implements SpeechRecognizer {
  private finalSegments: string[] = [];
  private interimText = "";
  private audioUri: string | null = null;
  private startedAt = 0;
  private listeners: Array<{ remove(): void }> = [];
  private settled = false;
  private onInterim?: (text: string) => void;

  private cleanup() {
    for (const l of this.listeners) {
      try { l.remove(); } catch {}
    }
    this.listeners = [];
  }

  async start(options: { lang?: string; onInterim?: (text: string) => void } = {}): Promise<void> {
    this.cleanup();
    this.finalSegments = [];
    this.interimText = "";
    this.audioUri = null;
    this.startedAt = Date.now();
    this.settled = false;
    this.onInterim = options.onInterim;

    const lang = options.lang ?? "es-CL";

    try { await ExpoSpeechRecognitionModule.abort(); } catch {}

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      throw new VoiceSessionError("recognition-unavailable", "Reconocimiento no disponible en este dispositivo");
    }
    if (!ExpoSpeechRecognitionModule.supportsRecording()) {
      throw new VoiceSessionError("recording-unsupported", "Este dispositivo no soporta grabación persistente (requiere Android 13+)");
    }

    const pkg = this.pickServicePackage();

    this.listeners.push(
      ExpoSpeechRecognitionModule.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
        try {
          const text = event.results?.[0]?.transcript?.trim() ?? "";
          if (!text) return;
          if (event.isFinal) {
            this.finalSegments.push(text);
            this.interimText = text;
            this.onInterim?.(this.finalSegments.join(" "));
          } else {
            // interim: mostrar acumulación + parcial actual
            const preview = [...this.finalSegments, text].join(" ").trim();
            this.interimText = text;
            this.onInterim?.(preview);
          }
        } catch {}
      })
    );

    this.listeners.push(
      ExpoSpeechRecognitionModule.addListener("audioend", (event: any) => {
        try {
          if (event?.uri) {
            this.audioUri = event.uri as string;
            console.info("[voice] audioend", { hasUri: true, uriTail: String(event.uri).slice(-40) });
          }
        } catch {}
      })
    );

    // error listener no resuelve acá: stop() decidirá según estado
    this.listeners.push(
      ExpoSpeechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        const code = (event as any)?.error ?? "unknown";
        const msg = (event as any)?.message ?? String(code);
        console.error("[voice] recognition error", { code, msg });
        // no-speech y aborted son esperables; los maneja stop() como no-speech
        if (code === "no-speech" || code === "aborted") return;
        // errores fatales: se propagarán al esperar end/error en stop()
      })
    );

    const docs = (FileSystem as any).documentDirectory ?? undefined;
    const fileName = `nota_${Date.now()}.wav`;
    const recordingOptions: any = docs
      ? { persist: true, outputDirectory: docs, outputFileName: fileName }
      : { persist: true, outputFileName: fileName };

    console.info("[voice] recognition started", { lang, pkg: pkg ?? "(default)" });

    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
      androidRecognitionServicePackage: pkg,
      recordingOptions,
    } as any);
  }

  async stop(): Promise<SpeechSessionResult> {
    console.info("[voice] stop requested");
    return new Promise<SpeechSessionResult>((resolve, reject) => {
      let endFired = false;
      let errorCode: string | null = null;
      let errorMsg: string | null = null;

      const finish = async (from: string) => {
        if (this.settled) return;
        this.settled = true;
        const transcript = this.finalSegments.join(" ").replace(/\s+/g, " ").trim();
        const audioUri = this.audioUri;
        const durationMs = Date.now() - this.startedAt;

        console.info("[voice] session finishing", { from, transcriptLength: transcript.length, hasUri: !!audioUri, durationMs, errorCode });

        // limpiar listeners de sesión pero mantener audioend hasta resolver?
        // cleanup ya remueve todo; audioUri ya fue capturado si llegó
        this.cleanup();

        if (errorCode && errorCode !== "no-speech" && errorCode !== "aborted") {
          if (errorCode === "not-allowed" || errorCode === "permission-denied") {
            reject(new VoiceSessionError("permission-denied", errorMsg ?? "Permiso denegado", errorCode));
            return;
          }
          if (errorCode === "language-not-supported") {
            reject(new VoiceSessionError("recognition-failed", errorMsg ?? "Idioma no soportado", errorCode));
            return;
          }
          reject(new VoiceSessionError("recognition-failed", errorMsg ?? String(errorCode), errorCode));
          return;
        }

        if (!audioUri) {
          reject(new VoiceSessionError("audio-not-saved", "No se pudo guardar el audio", "audio-not-saved"));
          return;
        }

        // validar que archivo existe y tiene datos
        try {
          const info: any = await FileSystem.getInfoAsync(audioUri);
          if (!info?.exists) {
            reject(new VoiceSessionError("audio-not-saved", "Archivo de audio no existe", info));
            return;
          }
          if (typeof info.size === "number" && info.size === 0) {
            reject(new VoiceSessionError("audio-not-saved", "Archivo de audio vacío", info));
            return;
          }
        } catch (e) {
          reject(new VoiceSessionError("audio-not-saved", "No se pudo verificar el audio", e));
          return;
        }

        if (!transcript) {
          reject(new VoiceSessionError("no-speech", "No se detectó voz", "no-speech"));
          return;
        }

        resolve({ transcript, audioUri, durationMs });
      };

      const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
        endFired = true;
        // dar breve ventana para que llegue audioend si aún no llegó (algunos dispositivos lo envían justo después de end)
        setTimeout(() => finish("end"), 400);
      });
      this.listeners.push(endListener);

      const errListener = ExpoSpeechRecognitionModule.addListener("error", (event: any) => {
        const code = event?.error ?? "unknown";
        errorCode = String(code);
        errorMsg = event?.message ?? String(code);
        if (code === "no-speech" || code === "aborted") {
          // dejar que end resuelva como no-speech
          return;
        }
        // error fatal: esperar end o timeout para entregar
      });
      this.listeners.push(errListener);

      try {
        ExpoSpeechRecognitionModule.stop();
      } catch (e) {
        // si stop falla, intentar abort
        try { ExpoSpeechRecognitionModule.abort(); } catch {}
      }

      // safety timeout: si end nunca llega
      setTimeout(() => {
        if (this.settled) return;
        if (!endFired && !errorCode) {
          console.warn("[voice] stop timeout, forcing abort");
          try { ExpoSpeechRecognitionModule.abort(); } catch {}
        }
        if (!this.settled) finish("timeout");
      }, 8000);
    });
  }

  async abort(): Promise<void> {
    try { await ExpoSpeechRecognitionModule.abort(); } catch {}
    this.cleanup();
    this.settled = true;
  }

  private pickServicePackage(): string | undefined {
    if (Platform.OS !== "android") return undefined;
    try {
      const services: string[] = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      if (services.includes("com.google.android.googlequicksearchbox")) return "com.google.android.googlequicksearchbox";
      const google = services.find((s) => s.includes("google") && s !== "com.google.android.as");
      if (google) return google;
      if (services.includes("com.google.android.as")) return "com.google.android.as";
      return undefined;
    } catch {
      return undefined;
    }
  }
}

export const speechRecognizer = new ExpoSpeechRecognizer();
