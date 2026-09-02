import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { noteRepository } from "@/data/SqliteNoteDataSource";
import {
  useAudioRecorder,
  RecordingPresets,
  useAudioRecorderState,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
import { transcriptionService } from "@/services/transcriptionService";

function buildTitleFromTranscript(transcript: string | null | undefined): string {
  if (transcript && transcript.trim() && !transcript.startsWith("Transcribiendo") && !transcript.startsWith("Grabación de voz")) {
    const words = transcript.trim().split(/\s+/).slice(0, 6).join(" ");
    if (!words) return `Nota de voz ${new Date().toLocaleTimeString()}`;
    const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
    const hasMore = transcript.trim().split(/\s+/).length > 6;
    return hasMore ? `${capitalized}…` : capitalized;
  }
  return `Nota de voz ${new Date().toLocaleTimeString()}`;
}

export function useRecording(onCreated: () => void) {
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Keep compatibility with old UI (lock/pause) but default to false — Section 3 simplified to toggle
  const [isLocked] = useState(false);
  const [isPaused] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRecording = recorderState.isRecording || false;

  // Section 1.4: request permission on mount, not on first tap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await AudioModule.getRecordingPermissionsAsync();
        if (!cancelled && perm.granted) {
          setIsPermissionGranted(true);
          try {
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          } catch (e) {
            console.error("[recording] setAudioModeAsync on mount failed:", e);
          }
        } else {
          // Ask once on mount so dialog appears before first record attempt
          try {
            const req = await AudioModule.requestRecordingPermissionsAsync();
            if (!cancelled && req.granted) {
              setIsPermissionGranted(true);
              try {
                await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
              } catch (e) {
                console.error("[recording] setAudioModeAsync after request failed:", e);
              }
            }
          } catch (e) {
            console.error("[recording] requestRecordingPermissionsAsync on mount failed:", e);
          }
        }
      } catch (e) {
        console.error("[recording] getRecordingPermissionsAsync failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      if (!startTimeRef.current) startTimeRef.current = Date.now() - recordingTime * 1000;
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 250);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (!isRecording) {
        startTimeRef.current = 0;
        setRecordingTime(0);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused, recordingTime]);

  useEffect(() => {
    return () => {
      transcriptionService.destroy().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const persistWithTranscription = useCallback(
    async (durationSec: number, uri: string | null) => {
      const duration = Math.max(1, Math.round(durationSec));
      // Section 2.3: save immediately with provisional text
      const provisional = "Transcribiendo…";
      const provisionalTitle = `Nota de voz ${new Date().toLocaleTimeString()}`;
      let created: { id: string } | null = null;
      try {
        created = await noteRepository.create({
          title: provisionalTitle,
          transcript: provisional,
          audioUri: uri,
          category: "Ideas",
          duration,
        });
        onCreated();
      } catch (e) {
        console.error("[recording] noteRepository.create failed:", e);
        Alert.alert("Error", `No se pudo guardar la nota: ${String((e as any)?.message ?? e)}`);
        return;
      }

      if (!created?.id) return;

      // If no uri (should not happen on native with expo-audio), skip transcription
      if (!uri) {
        try {
          await noteRepository.update(created.id, {
            transcript: "No se pudo transcribir — sin audio",
            title: provisionalTitle,
          });
          onCreated();
        } catch {}
        return;
      }

      // File-based on-device transcription — no API key
      setIsTranscribing(true);
      try {
        const text = await transcriptionService.transcribeAudioFile(uri, "es-ES");
        const finalTranscript = text?.trim() ? text.trim() : "No se pudo transcribir — toca para reintentar";
        const finalTitle =
          text?.trim() && !finalTranscript.startsWith("No se pudo")
            ? buildTitleFromTranscript(finalTranscript)
            : provisionalTitle;
        try {
          await noteRepository.update(created.id, {
            transcript: finalTranscript,
            title: finalTitle,
          });
          onCreated();
        } catch (e) {
          console.error("[recording] noteRepository.update after transcription failed:", e);
        }
      } catch (e: any) {
        console.error("[recording] transcribeAudioFile failed:", e);
        const msg: string = String(e?.message ?? e);
        let userMsg = "No se pudo transcribir — toca para reintentar";
        if (msg.includes("language-not-supported") || msg.includes("locale")) {
          userMsg = "Idioma no soportado — descarga el paquete de voz es-ES en Ajustes";
        } else if (msg.includes("network")) {
          userMsg = "Sin conexión — la transcripción on-device requiere modelo descargado";
        }
        try {
          await noteRepository.update(created.id, { transcript: userMsg });
          onCreated();
        } catch {}
      } finally {
        setIsTranscribing(false);
      }
    },
    [onCreated]
  );

  const startRecording = useCallback(async () => {
    setRecordingTime(0);
    startTimeRef.current = Date.now();

    // Web: MediaRecorder (no expo-audio). Keep simple, transcription will happen after save via file uri (blob url)
    if (Platform.OS === "web") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.start();
        mediaRecorderRef.current = mr;
        // Mark as recording fallback for web (isRecording derived from recorderState is false on web, so we need fallback flag)
        // On web we use a local flag via timer; simplest: set a state that isRecording fallback would have, but we now use isRecording from native only.
        // For web compat, we set a ref and rely on timer; however isRecording will be false — so we also need to manage web isRecording via a separate state.
        // Quick fix: we keep isRecordingFallback state for web only.
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        setWebRecording(true);
      } catch (e) {
        console.error("[recording] web getUserMedia failed:", e);
        Alert.alert("Permiso denegado", `Activa el micrófono: ${String((e as any)?.message ?? e)}`);
        setRecordingTime(0);
        startTimeRef.current = 0;
      }
      return;
    }

    // Native: 3 separated steps with real logs — Section 1.1-1.3
    let granted = isPermissionGranted;
    if (!granted) {
      try {
        const { status, granted: g } = await AudioModule.requestRecordingPermissionsAsync();
        console.log("[recording] requestRecordingPermissionsAsync status:", status);
        if (!g && status !== "granted") {
          Alert.alert("Permiso denegado", "Se necesita permiso de micrófono para grabar. Revisa Ajustes → Apps → SaveNotes → Permisos.");
          setRecordingTime(0);
          startTimeRef.current = 0;
          return;
        }
        setIsPermissionGranted(true);
        granted = true;
      } catch (e) {
        console.error("[recording] requestRecordingPermissionsAsync failed:", e);
        Alert.alert("Error", `No se pudo pedir permiso: ${String((e as any)?.message ?? e)}`);
        setRecordingTime(0);
        startTimeRef.current = 0;
        return;
      }
    }

    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch (e) {
      console.error("[recording] setAudioModeAsync failed:", e);
      // Continue — some devices work even if this fails
    }

    try {
      await recorder.prepareToRecordAsync();
    } catch (e) {
      console.error("[recording] prepareToRecordAsync failed:", e);
      // Section 1.3: recorder may be in bad state — next attempt will recreate via hook re-render; surface real error
      Alert.alert("Error", `No se pudo preparar la grabación: ${String((e as any)?.message ?? e)}`);
      setRecordingTime(0);
      startTimeRef.current = 0;
      return;
    }

    try {
      recorder.record();
    } catch (e) {
      console.error("[recording] recorder.record() failed:", e);
      Alert.alert("Error", `No se pudo iniciar la grabación: ${String((e as any)?.message ?? e)}`);
      setRecordingTime(0);
      startTimeRef.current = 0;
      try {
        await recorder.stop();
      } catch {}
    }
  }, [isPermissionGranted, recorder]);

  // Web-only recording flag (since expo-audio isRecording is false on web)
  const [webRecording, setWebRecording] = useState(false);
  const effectiveIsRecording = Platform.OS === "web" ? webRecording : isRecording;

  const discardRecording = useCallback(async () => {
    try {
      await transcriptionService.cancel();
    } catch {}
    setIsTranscribing(false);

    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {}
        try {
          (mr.stream as any)?.getTracks?.().forEach((t: MediaStreamTrack) => t.stop());
        } catch {}
      }
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      setWebRecording(false);
      setRecordingTime(0);
      startTimeRef.current = 0;
      return;
    }

    try {
      if (recorderState.isRecording) {
        try {
          await recorder.stop();
        } catch {}
      }
    } catch {}
    setRecordingTime(0);
    startTimeRef.current = 0;
    setWebRecording(false);
  }, [recorder, recorderState.isRecording]);

  const stopRecording = useCallback(async () => {
    const elapsed = recordingTime || Math.floor((Date.now() - startTimeRef.current) / 1000);

    // Section 3.1: no minimum duration, no Alert — tap-to-toggle saves immediately

    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        await new Promise<void>((resolve) => {
          mr.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            const url = URL.createObjectURL(blob);
            let realDuration = elapsed;
            try {
              const audio = new Audio(url);
              await new Promise<void>((res) => {
                audio.onloadedmetadata = () => res();
                audio.onerror = () => res();
                setTimeout(() => res(), 800);
              });
              if (audio.duration && isFinite(audio.duration)) realDuration = Math.max(elapsed, Math.round(audio.duration));
            } catch {}
            try {
              (mr.stream as any)?.getTracks?.().forEach((t: MediaStreamTrack) => t.stop());
            } catch {}
            setWebRecording(false);
            setRecordingTime(0);
            startTimeRef.current = 0;
            mediaRecorderRef.current = null;
            chunksRef.current = [];
            // Web transcription via expo-speech-recognition supports file uri too (blob url may not be supported); fallback to simple transcript if fails
            await persistWithTranscription(realDuration, url);
            resolve();
          };
          try {
            mr.stop();
          } catch {
            resolve();
          }
        });
      } else {
        setWebRecording(false);
      }
      return;
    }

    // Native
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        const uri: string | null = (recorder as any).uri ?? null;
        const duration = recordingTime || Math.max(1, Math.round((recorder as any).currentTime ?? elapsed));
        setRecordingTime(0);
        startTimeRef.current = 0;
        await persistWithTranscription(duration, uri);
      } else {
        // Edge: stopped but no active recording (e.g. quick double-tap) — just reset
        setRecordingTime(0);
        startTimeRef.current = 0;
      }
    } catch (e: any) {
      console.error("[recording] stop failed:", e);
      Alert.alert("Error", `No se pudo detener: ${String(e?.message ?? e)}`);
      setRecordingTime(0);
      startTimeRef.current = 0;
    }
  }, [recorder, recorderState.isRecording, recordingTime, persistWithTranscription]);

  const toggleRecording = useCallback(async () => {
    if (effectiveIsRecording) await stopRecording();
    else await startRecording();
  }, [effectiveIsRecording, startRecording, stopRecording]);

  // Compat wrappers for old API (index.tsx still passes onPressIn/Out) — Section 3 will migrate caller to toggle
  const cancelRecording = useCallback(async () => {
    await discardRecording();
  }, [discardRecording]);

  const sendRecording = useCallback(async () => {
    await stopRecording();
  }, [stopRecording]);

  const lockRecording = useCallback(() => {}, []);
  const togglePause = useCallback(async () => {}, []);

  return {
    isRecording: effectiveIsRecording,
    isLocked,
    isPaused,
    isTranscribing,
    recordingTime,
    toggleRecording,
    startRecording,
    stopRecording,
    lockRecording,
    cancelRecording,
    sendRecording,
    togglePause,
    discardRecording,
  };
}
