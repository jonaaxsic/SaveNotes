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

export function useRecording(onCreated: () => void) {
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isRecordingFallback, setIsRecordingFallback] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  // Web MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRecording = recorderState.isRecording || isRecordingFallback;

  // Timer mm:ss — SaveNotes, tabular-nums
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
        setIsPaused(false);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused, recordingTime]);

  const startRecording = useCallback(async () => {
    setIsLocked(false);
    setIsPaused(false);
    setRecordingTime(0);
    startTimeRef.current = Date.now();
    // Web: usar MediaRecorder real del browser
    if (Platform.OS === "web") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.start();
        mediaRecorderRef.current = mr;
        setIsRecordingFallback(true);
      } catch {
        Alert.alert("Permiso denegado", "Activa el micrófono en tu navegador.");
        setRecordingTime(0);
        startTimeRef.current = 0;
      }
      return;
    }

    // Native: expo-audio
    try {
      if (!isPermissionGranted) {
        const { status } = await AudioModule.requestRecordingPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Se necesita permiso de micrófono para grabar.");
          setRecordingTime(0);
          startTimeRef.current = 0;
          return;
        }
        setIsPermissionGranted(true);
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert("Error", "No se pudo iniciar la grabación.");
      setRecordingTime(0);
      startTimeRef.current = 0;
    }
  }, [isPermissionGranted, recorder]);

  const discardRecording = useCallback(async () => {
    // Web
    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try { mr.stop(); } catch {}
        // liberar stream
        try { (mr.stream as any)?.getTracks?.().forEach((t: MediaStreamTrack) => t.stop()); } catch {}
      }
      mediaRecorderRef.current = null;
      chunksRef.current = [];
      setIsRecordingFallback(false);
      setIsLocked(false);
      setIsPaused(false);
      setRecordingTime(0);
      startTimeRef.current = 0;
      return;
    }
    // Native
    try {
      if (recorderState.isRecording || isLocked) {
        try { await recorder.stop(); } catch {}
      }
    } catch {}
    setIsLocked(false);
    setIsPaused(false);
    setRecordingTime(0);
    startTimeRef.current = 0;
  }, [recorder, recorderState.isRecording, isLocked]);

  const persistRecording = useCallback(async (durationSec: number, uri: string | null) => {
    const duration = Math.max(1, Math.round(durationSec));
    await noteRepository.create({
      title: `Nota de voz ${new Date().toLocaleTimeString()}`,
      transcript: `Grabación de voz — ${new Date().toLocaleString()}`,
      audioUri: uri,
      category: "Ideas",
      duration,
    });
    onCreated();
  }, [onCreated]);

  const stopRecording = useCallback(async () => {
    const elapsed = recordingTime || Math.floor((Date.now() - startTimeRef.current) / 1000);
    // <1s → descarta (WhatsApp)
    if (elapsed < 1) {
      await discardRecording();
      Alert.alert("Grabación descartada", "Mantén presionado al menos 1 segundo.");
      return;
    }
    // Web: parar MediaRecorder y guardar
    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        await new Promise<void>((resolve) => {
          mr.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            const url = URL.createObjectURL(blob);
            // duración real desde elapsed + audio metadata fallback
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
            try { (mr.stream as any)?.getTracks?.().forEach((t: MediaStreamTrack) => t.stop()); } catch {}
            await persistRecording(realDuration, url);
            setIsRecordingFallback(false);
            setIsLocked(false);
            setIsPaused(false);
            setRecordingTime(0);
            startTimeRef.current = 0;
            resolve();
          };
          try { mr.stop(); } catch { resolve(); }
        });
      } else {
        setIsRecordingFallback(false);
      }
      return;
    }

    // Native: expo-audio
    try {
      if (recorderState.isRecording || isLocked) {
        await recorder.stop();
        const uri: string | null = recorder.uri ?? null;
        const duration = recordingTime || Math.max(1, Math.round(recorder.currentTime ?? elapsed));
        await persistRecording(duration, uri);
        setIsLocked(false);
        setIsPaused(false);
        setRecordingTime(0);
        startTimeRef.current = 0;
      }
    } catch (e) {
      Alert.alert("Error", String(e));
      setIsLocked(false);
      setRecordingTime(0);
    }
  }, [recorder, recorderState.isRecording, isLocked, recordingTime, discardRecording, persistRecording]);

  const toggleRecording = useCallback(async () => {
    if (isRecording && !isLocked) await stopRecording();
    else if (!isRecording) await startRecording();
    else if (isLocked) await stopRecording();
  }, [isRecording, isLocked, startRecording, stopRecording]);

  const lockRecording = useCallback(() => {
    if (isRecording && !isLocked) setIsLocked(true);
  }, [isRecording, isLocked]);

  const cancelRecording = useCallback(async () => {
    await discardRecording();
  }, [discardRecording]);

  const sendRecording = useCallback(async () => {
    await stopRecording();
  }, [stopRecording]);

  const togglePause = useCallback(async () => {
    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      if (!mr) return;
      try {
        if (mr.state === "recording") {
          mr.pause();
          setIsPaused(true);
          if (timerRef.current) clearInterval(timerRef.current);
        } else if (mr.state === "paused") {
          mr.resume();
          setIsPaused(false);
          startTimeRef.current = Date.now() - recordingTime * 1000;
        }
      } catch {}
      return;
    }
    // Native: expo-audio pause/resume si disponible
    try {
      // @ts-ignore — API puede variar por SDK
      if (isPaused) {
        // @ts-ignore
        if (typeof (recorder as any).record === "function") (recorder as any).record();
        setIsPaused(false);
        startTimeRef.current = Date.now() - recordingTime * 1000;
      } else {
        // @ts-ignore
        if (typeof (recorder as any).pause === "function") await (recorder as any).pause();
        setIsPaused(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch {
      setIsPaused((v) => !v);
    }
  }, [isPaused, recordingTime, recorder]);

  return {
    isRecording,
    isLocked,
    isPaused,
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
