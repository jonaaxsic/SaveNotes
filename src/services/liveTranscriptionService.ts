import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from "expo-speech-recognition";

/**
 * Opción A — Transcripción en VIVO con audio persistido.
 * - No usa expo-audio para grabar. Todo lo hace expo-speech-recognition.
 * - startLive() entrega interimResults + final transcript + wav uri via audioend.
 * - Gratis: usa SFSpeechRecognizer (iOS) / SpeechRecognizer (Android).
 * - Android: prefiere com.google.android.as si está instalado.
 * - Híbrido por defecto (requiresOnDevice: false) — usa red si el modelo offline no está.
 */

export type LiveResult = {
  transcript: string;
  isFinal: boolean;
};

export type LiveSessionResult = {
  finalTranscript: string | null;
  audioUri: string | null;
  didAbort: boolean;
  errorCode?: string;
};

let resultListener: { remove: () => void } | null = null;
let errorListener: { remove: () => void } | null = null;
let endListener: { remove: () => void } | null = null;
let audioEndListener: { remove: () => void } | null = null;

function cleanup() {
  try { resultListener?.remove(); } catch {}
  try { errorListener?.remove(); } catch {}
  try { endListener?.remove(); } catch {}
  try { audioEndListener?.remove(); } catch {}
  resultListener = null;
  errorListener = null;
  endListener = null;
  audioEndListener = null;
}

export const liveTranscriptionService = {
  /**
   * Pide permisos de micro + reconocimiento (Android: RECORD_AUDIO, iOS: mic+speech).
   * Retorna granted boolean.
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return !!res.granted;
    } catch {
      return false;
    }
  },

  async getPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    try {
      const res = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      return { granted: !!res.granted, canAskAgain: !!res.canAskAgain };
    } catch {
      return { granted: false, canAskAgain: true };
    }
  },

  isRecognitionAvailable(): boolean {
    if (Platform.OS === "web") return true;
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  },

  supportsRecording(): boolean {
    if (Platform.OS === "web") return false;
    try {
      return ExpoSpeechRecognitionModule.supportsRecording();
    } catch {
      return false;
    }
  },

  /**
   * Devuelve el package preferido para Android.
   * Si com.google.android.as está instalado, lo usa; si no, undefined (default del OS).
   */
  pickAndroidServicePackage(): string | undefined {
    if (Platform.OS !== "android") return undefined;
    try {
      const services: string[] = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      if (services.includes("com.google.android.as")) return "com.google.android.as";
      // Si no está, preferir Google si existe otro google package, sino default
      const google = services.find((s) => s.includes("google"));
      return google ?? undefined;
    } catch {
      return undefined;
    }
  },

  getAvailableServices(): string[] {
    if (Platform.OS !== "android") return [];
    try {
      return ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
    } catch {
      return [];
    }
  },

  async getSupportedLocales(pkg?: string) {
    try {
      return await ExpoSpeechRecognitionModule.getSupportedLocales({
        androidRecognitionServicePackage: pkg,
      });
    } catch {
      return { locales: [], installedLocales: [] };
    }
  },

  /**
   * Inicia sesión VIVO. Resuelve cuando llega end + audioend o error fatal.
   * onInterim se llama con cada resultado parcial para mostrar en UI mientras graba.
   */
  async startLive(options: {
    lang?: string;
    onInterim?: (text: string, isFinal: boolean) => void;
    androidServicePackage?: string;
    persistAudio?: boolean;
  } = {}): Promise<LiveSessionResult> {
    const lang = options.lang ?? "es-ES";
    const pkg = options.androidServicePackage ?? this.pickAndroidServicePackage();
    const persistAudio = options.persistAudio ?? true;

    // Limpiar sesión previa
    try { await ExpoSpeechRecognitionModule.abort(); } catch {}
    cleanup();

    return new Promise<LiveSessionResult>((resolve) => {
      let interimText = "";
      let finalText = "";
      let audioUri: string | null = null;
      let didAbort = false;
      let settled = false;

      const finish = (result: LiveSessionResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      resultListener = ExpoSpeechRecognitionModule.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
        try {
          const text = event.results?.[0]?.transcript?.trim() ?? "";
          if (!text) return;
          interimText = text;
          if (event.isFinal) finalText = text;
          options.onInterim?.(text, !!event.isFinal);
        } catch {}
      });

      audioEndListener = ExpoSpeechRecognitionModule.addListener("audioend", (event: any) => {
        try {
          if (event?.uri) audioUri = event.uri as string;
        } catch {}
      });

      errorListener = ExpoSpeechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        const code = (event as any)?.error ?? "unknown";
        // no-speech y aborted no son fatales — dejamos que end resuelva con lo que haya
        if (code === "no-speech" || code === "aborted") {
          didAbort = code === "aborted";
          // Si ya tenemos finalText, resolver en end; si no, esperar end para no cortar antes de audioend
          return;
        }
        // Errores reales: network, not-allowed, service-not-allowed, language-not-supported, etc.
        finish({ finalTranscript: finalText || interimText || null, audioUri, didAbort: false, errorCode: String(code) });
      });

      endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
        const transcript = finalText || interimText || null;
        finish({ finalTranscript: transcript, audioUri, didAbort, errorCode: undefined });
      });

      // Híbrido gratis: false en ambas plataformas para máxima tasa de éxito.
      // Si el modelo offline está, Android lo usará igual si la red falla.
      const startOpts: any = {
        lang,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
        androidRecognitionServicePackage: pkg,
      };
      if (persistAudio && this.supportsRecording()) {
        // Persist estable: documentos (no cache) + nombre por nota — sobrevive a purga del OS
        const docs = (FileSystem as any).documentDirectory ?? undefined;
        const fileName = `nota_${Date.now()}.wav`;
        startOpts.recordingOptions = docs
          ? { persist: true, outputDirectory: docs, outputFileName: fileName }
          : { persist: true, outputFileName: fileName };
      }
      ExpoSpeechRecognitionModule.start(startOpts);

      // Safety: si el OS nunca dispara end (ej. servicio colgado), abortar a los 60s max
      setTimeout(() => {
        if (settled) return;
        try { ExpoSpeechRecognitionModule.abort(); } catch {}
        finish({ finalTranscript: finalText || interimText || null, audioUri, didAbort: true });
      }, 60000);
    });
  },

  async stop(): Promise<void> {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  },

  async abort(): Promise<void> {
    try {
      await ExpoSpeechRecognitionModule.abort();
    } catch {}
    cleanup();
  },

  destroy(): void {
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    cleanup();
  },
};
