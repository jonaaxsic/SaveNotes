import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceSessionError } from "@/types/voice";
import type { VoiceRecordingStatus, VoiceUiError } from "@/types/voice";
import { voicePermissionService } from "@/services/voice/VoicePermissionService";
import { speechRecognizer } from "@/services/voice/SpeechRecognitionService";
import { VoiceNoteService } from "@/services/voice/VoiceNoteService";
import { noteRepository } from "@/data/SqliteNoteDataSource";

const voiceNoteService = new VoiceNoteService(speechRecognizer, noteRepository as any);

function toUiError(error: unknown): VoiceUiError {
  if (error instanceof VoiceSessionError) {
    switch (error.code) {
      case "permission-denied":
        return { code: error.code, message: "Permiso denegado — activa micrófono y reconocimiento en Ajustes" };
      case "recognition-unavailable":
        return { code: error.code, message: "Reconocimiento no disponible en este dispositivo" };
      case "recording-unsupported":
        return { code: error.code, message: "Este dispositivo no soporta grabación de voz (requiere Android 13+)" };
      case "no-speech":
        return { code: error.code, message: "No se detectó voz — intenta hablar más cerca del micrófono" };
      case "audio-not-saved":
        return { code: error.code, message: "No se pudo guardar el audio — intenta de nuevo" };
      case "recognition-failed":
        return { code: error.code, message: String(error.message ?? "Falló el reconocimiento") };
      default:
        return { code: "unknown", message: String((error as any)?.message ?? "Error desconocido") };
    }
  }
  const msg = String((error as any)?.message ?? error);
  if (msg.includes("not-allowed") || msg.includes("permission")) return { code: "permission-denied", message: "Permiso denegado — activa micrófono y reconocimiento en Ajustes" };
  if (msg.includes("language-not-supported")) return { code: "recognition-failed", message: "Idioma no soportado — descarga el paquete es-CL en Ajustes" };
  if (msg.includes("network")) return { code: "recognition-failed", message: "Sin conexión — descarga el modelo offline" };
  return { code: "unknown", message: msg };
}

export function useVoiceNoteRecording(onCreated: () => void) {
  const [status, setStatus] = useState<VoiceRecordingStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<VoiceUiError | null>(null);

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      speechRecognizer.abort().catch(() => {});
    };
  }, [clearTimer]);

  useEffect(() => {
    if (status === "recording") {
      startTimeRef.current = Date.now() - elapsedMs;
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 250);
    } else {
      clearTimer();
      if (status === "idle" || status === "completed" || status === "error") {
        // no reset elapsedMs here; caller decides
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status, elapsedMs, clearTimer]);

  const start = useCallback(async () => {
    try {
      setError(null);
      setInterimText("");
      setElapsedMs(0);
      setStatus("requesting-permission");

      // PASO: comprobar capacidades antes de grabar
      if (!voicePermissionService.isRecognitionAvailable()) {
        throw new VoiceSessionError("recognition-unavailable");
      }
      if (!voicePermissionService.supportsRecording()) {
        throw new VoiceSessionError("recording-unsupported");
      }

      const perm = await voicePermissionService.get();
      if (!perm.granted) {
        const req = await voicePermissionService.request();
        if (!req.granted) {
          if (!req.canAskAgain) throw new VoiceSessionError("permission-denied", "Permiso denegado permanente — ve a Ajustes");
          throw new VoiceSessionError("permission-denied");
        }
      }

      setStatus("recording");
      console.info("[voice] start requested");
      await voiceNoteService.start({
        lang: "es-CL",
        onInterim: (t) => setInterimText(t),
      });
      console.info("[voice] recognition started");
    } catch (e) {
      console.error("[voice] start failed", e);
      setStatus("error");
      setError(toUiError(e));
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      setStatus("stopping");
      console.info("[voice] stop requested");
      const note = await voiceNoteService.finish();
      setStatus("saving");
      // note ya creada en VoiceNoteService; solo notificar
      setInterimText("");
      setStatus("completed");
      onCreated();
      // volver a idle tras breve delay
      setTimeout(() => {
        setStatus("idle");
        setElapsedMs(0);
      }, 400);
      return note;
    } catch (e) {
      console.error("[voice] finish failed", e);
      setStatus("error");
      setError(toUiError(e));
      // no crear nota de error en SQLite — error es UI, no dato
      throw e;
    }
  }, [onCreated]);

  const cancel = useCallback(async () => {
    await voiceNoteService.cancel();
    setStatus("idle");
    setElapsedMs(0);
    setInterimText("");
    setError(null);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
    if (status === "error") setStatus("idle");
  }, [status]);

  const recordingTime = Math.floor(elapsedMs / 1000);
  const isRecording = status === "recording" || status === "requesting-permission" || status === "stopping";

  return {
    status,
    isRecording,
    recordingTime,
    interimText,
    error,
    start,
    stop,
    cancel,
    dismissError,
    // compat: single toggle
    toggleRecording: async () => {
      if (status === "recording" || status === "requesting-permission") await stop();
      else await start();
    },
  };
}
