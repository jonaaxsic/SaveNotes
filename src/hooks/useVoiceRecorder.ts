/**
 * useVoiceRecorder — thin hook only state/duration/audioLevel/start/stop/cancel (§6)
 *
 * - state: idle | recording | processing | error
 * - durationMs + audioLevel via expo-audio isMeteringEnabled polling (10-20fps, no Math.random)
 * - start/stop/cancel with stopInProgressRef guard (§34) to prevent double-stop races
 * - No interim transcript, no "Escuchando..." — UI is RecordingBar only
 * - Delegates persistence + STT + SQLite to VoiceNoteService (single commit)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceSessionError } from "@/types/voice";
import type { VoiceRecorderState, VoiceUiError } from "@/types/voice";
import { getWavRecordingOptions, resolveRecorderUri, ensurePermissions } from "@/services/audio/audioRecorderService";
import { VoiceNoteService } from "@/services/notes/voiceNoteService";
import { noteRepository } from "@/data/SqliteNoteDataSource";
import { setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { voicePermissionService } from "@/services/voice/VoicePermissionService";

const voiceNoteService = new VoiceNoteService(noteRepository as unknown as import("@/data/NoteRepository").NoteRepository);

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
        // Map AUDIO_URI_MISSING etc to human message without exposing raw code
        if (String(error.message).includes("AUDIO_URI_MISSING") || String(error.code).includes("AUDIO_URI_MISSING") || String(error.code).includes("audio-uri-missing")) {
          return { code: "audio-not-saved", message: "No se pudo guardar el audio — intenta de nuevo" };
        }
        if (String(error.message).includes("audio-empty")) return { code: "audio-not-saved", message: "Audio vacío — intenta grabar más tiempo" };
        if (String(error.message).includes("invalid-duration")) return { code: "audio-not-saved", message: "Grabación demasiado corta — intenta de nuevo" };
        return { code: error.code, message: "No se pudo guardar el audio — intenta de nuevo" };
      case "recognition-failed":
        return { code: error.code, message: String(error.message ?? "Falló el reconocimiento") };
      default:
        return { code: "unknown", message: String((error as { message?: string })?.message ?? "Error desconocido") };
    }
  }
  const msg = String((error as { message?: string })?.message ?? error);
  if (msg.includes("not-allowed") || msg.includes("permission")) return { code: "permission-denied", message: "Permiso denegado — activa micrófono y reconocimiento en Ajustes" };
  if (msg.includes("language-not-supported")) return { code: "recognition-failed", message: "Idioma no soportado — descarga el paquete es-CL en Ajustes" };
  if (msg.includes("network")) return { code: "recognition-failed", message: "Sin conexión — descarga el modelo offline" };
  if (msg.includes("AUDIO_URI_MISSING")) return { code: "audio-not-saved", message: "No se pudo guardar el audio — intenta de nuevo" };
  return { code: "unknown", message: msg };
}

export function useVoiceRecorder(onCreated: () => void) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(-160);
  const [error, setError] = useState<VoiceUiError | null>(null);

  // expo-audio is the single mic owner — explicit WAV 16k mono
  const recorder = useAudioRecorder(getWavRecordingOptions());
  const recorderState = useAudioRecorderState(recorder);

  const startTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopInProgressRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (meteringTimerRef.current) clearInterval(meteringTimerRef.current);
    durationTimerRef.current = null;
    meteringTimerRef.current = null;
  }, []);

  // Duration + metering polling
  useEffect(() => {
    if (state === "recording") {
      startTimeRef.current = Date.now() - durationMs;
      durationTimerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current);
      }, 100); // 10fps for duration

      // Metering: poll getStatus().metering (dB -160..0) at ~15fps, no Math.random
      meteringTimerRef.current = setInterval(() => {
        try {
          const s = recorder.getStatus();
          if (typeof s.metering === "number" && isFinite(s.metering)) {
            setAudioLevel(s.metering);
          }
        } catch {
          // ignore metering errors — keep last level, waveform will show neutral if unavailable
        }
      }, 70); // ~14fps
    } else {
      clearTimers();
      if (state === "idle") {
        setAudioLevel(-160);
      }
    }
    return () => clearTimers();
  }, [state, durationMs, clearTimers, recorder]);

  useEffect(() => {
    return () => {
      clearTimers();
      // Best-effort abort metering without throwing
      try {
        if (recorderState.isRecording) {
          recorder.stop().catch(() => {});
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    if (stopInProgressRef.current) return;
    try {
      setError(null);
      setDurationMs(0);
      setAudioLevel(-160);
      setState("recording");

      // Permissions + capabilities check before touching mic
      try {
        // Check recognition availability for STT post-stop (not for recording itself)
        if (!voicePermissionService.isRecognitionAvailable()) {
          console.warn("[VOICE] recognition unavailable, will still record but STT may fail");
        }
      } catch {}

      await ensurePermissions();
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch (e) {
        console.warn("[VOICE] setAudioModeAsync failed", e);
      }

      try {
        await recorder.prepareToRecordAsync();
      } catch (e) {
        const msg = String((e as { message?: string })?.message ?? e);
        // Already prepared is not fatal — proceed to record
        if (!msg.toLowerCase().includes("already") && !msg.toLowerCase().includes("prepared")) throw e;
      }
      recorder.record();
      console.info("[VOICE] recording started");
    } catch (e) {
      console.error("[VOICE] start failed", e);
      setState("error");
      setError(toUiError(e));
      clearTimers();
    }
  }, [recorder, clearTimers]);

  const stop = useCallback(async () => {
    if (stopInProgressRef.current) return;
    stopInProgressRef.current = true;
    try {
      setState("processing");
      console.info("[VOICE] stop requested");
      clearTimers();

      // Stop expo-audio recorder — deterministic URI resolution after stop
      try {
        if (recorderState.isRecording || recorder.isRecording) {
          await recorder.stop();
        }
      } catch (e) {
        console.warn("[VOICE] recorder.stop threw", e);
      }

      const uri = resolveRecorderUri(recorder as unknown as import("@/services/audio/audioRecorderService").RecorderInstance);
      const finalDurationMs = durationMs || Date.now() - startTimeRef.current;

      console.info("[VOICE] session finishing", { hasUri: !!uri, durationMs: finalDurationMs });

      const note = await voiceNoteService.createFromRecording({ tempUri: uri, durationMs: finalDurationMs });

      setState("idle");
      setDurationMs(0);
      setAudioLevel(-160);
      onCreated();
      return note;
    } catch (e) {
      console.error("[VOICE] finish failed", e);
      setState("error");
      setError(toUiError(e));
      throw e;
    } finally {
      stopInProgressRef.current = false;
      clearTimers();
    }
  }, [recorder, recorderState.isRecording, durationMs, clearTimers, onCreated]);

  const cancel = useCallback(async () => {
    if (stopInProgressRef.current) return;
    try {
      clearTimers();
      try {
        if (recorderState.isRecording || recorder.isRecording) {
          await recorder.stop();
        }
      } catch {}
      // No persistence, no STT — discard
    } finally {
      setState("idle");
      setDurationMs(0);
      setAudioLevel(-160);
      setError(null);
      stopInProgressRef.current = false;
    }
  }, [recorder, recorderState.isRecording, clearTimers]);

  const dismissError = useCallback(() => {
    setError(null);
    if (state === "error") setState("idle");
  }, [state]);

  // Compat for RecordButton callers expecting toggle
  const toggleRecording = useCallback(async () => {
    if (state === "recording") await stop();
    else if (state === "idle" || state === "error") await start();
  }, [state, start, stop]);

  return {
    state,
    // backward compat: status alias
    status: state as unknown as import("@/types/voice").VoiceRecordingStatus,
    isRecording: state === "recording",
    isProcessing: state === "processing",
    durationMs,
    recordingTime: Math.floor(durationMs / 1000),
    audioLevel,
    error,
    start,
    stop,
    cancel,
    dismissError,
    toggleRecording,
  };
}
