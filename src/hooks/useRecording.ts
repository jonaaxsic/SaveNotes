import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { noteRepository } from "@/data/SqliteNoteDataSource";
import { AudioModule, setAudioModeAsync, useAudioRecorder, RecordingPresets, useAudioRecorderState } from "expo-audio";
import { liveTranscriptionService, type LiveSessionResult } from "@/services/liveTranscriptionService";
import { transcriptionService } from "@/services/transcriptionService";

function buildTitleFromTranscript(transcript: string | null | undefined): string {
  if (transcript && transcript.trim() && !transcript.startsWith("No se") && !transcript.startsWith("Grabación de voz")) {
    const words = transcript.trim().split(/\s+/).slice(0, 6).join(" ");
    if (!words) return `Nota de voz ${new Date().toLocaleTimeString()}`;
    const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
    const hasMore = transcript.trim().split(/\s+/).length > 6;
    return hasMore ? `${capitalized}…` : capitalized;
  }
  return `Nota de voz ${new Date().toLocaleTimeString()}`;
}

type DialogState = {
  visible: boolean;
  title: string;
  message: string;
  variant: "info" | "confirm" | "destructive";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
};

export function useRecording(onCreated: () => void) {
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ visible: false, title: "", message: "", variant: "info" });

  const [isLocked] = useState(false);
  const [isPaused] = useState(false);

  // Fallback audio recorder for devices where supportsRecording() is false (Android <13)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isFallbackRecording = recorderState.isRecording || false;
  const useFallbackAudio = Platform.OS !== "web" && !liveTranscriptionService.supportsRecording();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveSessionRef = useRef<Promise<LiveSessionResult> | null>(null);

  const [isRecordingNative, setIsRecordingNative] = useState(false);
  const [webRecording, setWebRecording] = useState(false);

  const showDialog = useCallback((d: Omit<DialogState, "visible">) => {
    setDialog({ ...d, visible: true });
  }, []);
  const dismissDialog = useCallback(() => setDialog((p) => ({ ...p, visible: false })), []);

  // Request permissions on mount — audio + speech
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Check both
        const audioPerm = await AudioModule.getRecordingPermissionsAsync().catch(() => null);
        const speechPerm = await liveTranscriptionService.getPermissions().catch(() => null);
        const audioGranted = !!audioPerm?.granted;
        const speechGranted = !!speechPerm?.granted;
        if (!cancelled && audioGranted && speechGranted) {
          setIsPermissionGranted(true);
          try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}
          return;
        }
        // Request speech permissions (also asks RECORD_AUDIO on Android)
        try {
          const req = await liveTranscriptionService.requestPermissions();
          if (!cancelled && req) {
            setIsPermissionGranted(true);
            try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}
          } else {
            // Fallback: try legacy audio permission
            try {
              const reqAudio = await AudioModule.requestRecordingPermissionsAsync();
              if (!cancelled && reqAudio.granted) {
                setIsPermissionGranted(true);
                try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}
              }
            } catch {}
          }
        } catch {}
      } catch (e) {
        console.error("[recording] permission check failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Timer — considera fallback audio (expo-audio) cuando persist no soportado
  useEffect(() => {
    const isRec = Platform.OS === "web" ? (webRecording || isRecordingNative) : (useFallbackAudio ? isFallbackRecording : isRecordingNative);
    if (isRec && !isPaused) {
      if (!startTimeRef.current) startTimeRef.current = Date.now() - recordingTime * 1000;
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
      }, 250);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (!isRec) {
        startTimeRef.current = 0;
        setRecordingTime(0);
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecordingNative, isFallbackRecording, webRecording, isPaused, recordingTime, useFallbackAudio]);

  useEffect(() => {
    return () => {
      liveTranscriptionService.destroy();
      transcriptionService.destroy().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const persistLiveResult = useCallback(async (durationSec: number, result: LiveSessionResult) => {
    const duration = Math.max(1, Math.round(durationSec));
    const uri = result.audioUri ?? null;
    let transcript = result.finalTranscript?.trim() ?? "";

    // Map error codes to user messages
    if (result.errorCode) {
      const code = result.errorCode;
      if (code === "not-allowed") transcript = "Permiso denegado — activa micrófono y reconocimiento en Ajustes";
      else if (code === "language-not-supported") transcript = "Idioma no soportado — descarga el paquete es-ES en Ajustes";
      else if (code === "network") transcript = "Sin conexión — conecta a internet o descarga el modelo offline es-ES";
      else if (code === "service-not-allowed") transcript = "Servicio no disponible — instala Google Speech Services";
      else if (!transcript) transcript = "No se pudo transcribir — toca para reintentar";
    } else if (!transcript) {
      // Antes decía "No se pudo guardar audio — reintenta" si uri era null, pero eso confundía: el audio SÍ se guardó (fallback) o el problema fue solo transcripción
      transcript = "No se detectó voz — toca para reintentar";
    }

    const isError = transcript.startsWith("No se") || transcript.startsWith("Permiso") || transcript.startsWith("Idioma") || transcript.startsWith("Sin conexión") || transcript.startsWith("Servicio");
    const title = !isError && transcript ? buildTitleFromTranscript(transcript) : `Nota de voz ${new Date().toLocaleTimeString()}`;

    try {
      await noteRepository.create({ title, transcript, audioUri: uri, category: "Ideas", duration });
      onCreated();
    } catch (e) {
      console.error("[recording] noteRepository.create failed:", e);
      showDialog({ title: "Error", message: `No se pudo guardar la nota: ${String((e as any)?.message ?? e)}`, variant: "info", confirmLabel: "Entendido" });
    }
  }, [onCreated, showDialog]);

  // Legacy file-based fallback for web or when live fails to produce audio
  const persistWithFileTranscription = useCallback(async (durationSec: number, uri: string | null) => {
    const duration = Math.max(1, Math.round(durationSec));
    if (!uri) {
      await noteRepository.create({ title: `Nota de voz ${new Date().toLocaleTimeString()}`, transcript: "No se pudo transcribir — sin audio", audioUri: null, category: "Ideas", duration });
      onCreated();
      return;
    }
    setIsTranscribing(true);
    try {
      const text = await transcriptionService.transcribeAudioFile(uri, "es-ES");
      const finalTranscript = text?.trim() ? text.trim() : "No se pudo transcribir — toca para reintentar";
      const finalTitle = text?.trim() && !finalTranscript.startsWith("No se pudo") ? buildTitleFromTranscript(finalTranscript) : `Nota de voz ${new Date().toLocaleTimeString()}`;
      await noteRepository.create({ title: finalTitle, transcript: finalTranscript, audioUri: uri, category: "Ideas", duration });
      onCreated();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      let userMsg = "No se pudo transcribir — toca para reintentar";
      if (msg.includes("language-not-supported")) userMsg = "Idioma no soportado — descarga el paquete de voz es-ES en Ajustes";
      else if (msg.includes("network")) userMsg = "Sin conexión — la transcripción requiere modelo descargado";
      await noteRepository.create({ title: `Nota de voz ${new Date().toLocaleTimeString()}`, transcript: userMsg, audioUri: uri, category: "Ideas", duration });
      onCreated();
    } finally { setIsTranscribing(false); }
  }, [onCreated]);

  const startRecording = useCallback(async () => {
    setRecordingTime(0);
    setInterimTranscript("");
    startTimeRef.current = Date.now();

    // Web path — keep MediaRecorder, use file-based fallback after
    if (Platform.OS === "web") {
      // Try live first on web (polyfilled)
      const canLive = liveTranscriptionService.isRecognitionAvailable();
      if (canLive) {
        try {
          setIsRecordingNative(true);
          // Web live doesn't persist file, so we use interim only and fallback to MediaRecorder for audio
          // Actually start MediaRecorder in parallel for audio, and live for transcript
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mr = new MediaRecorder(stream);
          chunksRef.current = [];
          mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
          mr.start();
          mediaRecorderRef.current = mr;
          setWebRecording(true);
          // Start live session in background for interim
          const livePromise = liveTranscriptionService.startLive({
            lang: "es-ES",
            onInterim: (t) => setInterimTranscript(t),
          });
          liveSessionRef.current = livePromise;
          return;
        } catch (e) {
          console.error("[recording] web live start failed, fallback to MediaRecorder only:", e);
          // Fall through to pure MediaRecorder
        }
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.start();
        mediaRecorderRef.current = mr;
        setWebRecording(true);
      } catch (e) {
        console.error("[recording] web getUserMedia failed:", e);
        showDialog({ title: "Permiso denegado", message: `Activa el micrófono: ${String((e as any)?.message ?? e)}`, variant: "info" });
        setRecordingTime(0); startTimeRef.current = 0;
      }
      return;
    }

    // Native path — Option A live
    let granted = isPermissionGranted;
    if (!granted) {
      const ok = await liveTranscriptionService.requestPermissions();
      if (!ok) {
        const perm = await liveTranscriptionService.getPermissions();
        const msg = !perm.canAskAgain
          ? "Se necesita permiso de micrófono y reconocimiento. Revisa Ajustes → Apps → SaveNotes → Permisos."
          : "Se necesita permiso de micrófono para grabar.";
        showDialog({ title: "Permiso denegado", message: msg, variant: "info" });
        setRecordingTime(0); startTimeRef.current = 0;
        return;
      }
      setIsPermissionGranted(true);
      granted = true;
    }

    if (!liveTranscriptionService.isRecognitionAvailable()) {
      showDialog({ title: "No disponible", message: "El reconocimiento de voz no está disponible en este dispositivo.", variant: "info" });
      return;
    }

    try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch (e) { console.error("[recording] setAudioMode failed:", e); }

    // Check service on Android for logging
    if (Platform.OS === "android") {
      const pkg = liveTranscriptionService.pickAndroidServicePackage();
      console.log("[recording] Android service package:", pkg ?? "(default)", "available:", liveTranscriptionService.getAvailableServices(), "supportsRecording:", liveTranscriptionService.supportsRecording());
    }

    // Fallback: Android <13 / sin persist → usar expo-audio para el archivo + live sin persist para transcript
    if (useFallbackAudio) {
      try {
        await recorder.prepareToRecordAsync();
      } catch (e) {
        console.error("[recording] prepareToRecordAsync failed:", e);
        showDialog({ title: "Error", message: `No se pudo preparar la grabación: ${String((e as any)?.message ?? e)}`, variant: "info" });
        setRecordingTime(0); startTimeRef.current = 0;
        return;
      }
      try {
        const livePromise = liveTranscriptionService.startLive({
          lang: "es-ES",
          persistAudio: false,
          onInterim: (text) => setInterimTranscript(text),
        });
        liveSessionRef.current = livePromise;
      } catch (e) {
        console.error("[recording] startLive fallback failed:", e);
        // Si live falla, igual seguimos grabando audio para no perder la nota (transcript quedará con error)
        liveSessionRef.current = Promise.resolve({ finalTranscript: null, audioUri: null, didAbort: false, errorCode: String((e as any)?.message ?? "unknown") });
      }
      try {
        recorder.record();
      } catch (e) {
        console.error("[recording] recorder.record failed:", e);
        try { await liveTranscriptionService.abort(); } catch {}
        liveSessionRef.current = null;
        showDialog({ title: "Error", message: `No se pudo iniciar la grabación: ${String((e as any)?.message ?? e)}`, variant: "info" });
        setRecordingTime(0); startTimeRef.current = 0;
        return;
      }
      // No setIsRecordingNative — effectiveIsRecording viene de recorderState
      return;
    }

    try {
      const sessionPromise = liveTranscriptionService.startLive({
        lang: "es-ES",
        persistAudio: true,
        onInterim: (text) => setInterimTranscript(text),
      });
      liveSessionRef.current = sessionPromise;
      setIsRecordingNative(true);
    } catch (e) {
      console.error("[recording] startLive failed:", e);
      showDialog({ title: "Error", message: `No se pudo iniciar la grabación: ${String((e as any)?.message ?? e)}`, variant: "info" });
      setRecordingTime(0); startTimeRef.current = 0;
      setIsRecordingNative(false);
    }
  }, [isPermissionGranted, showDialog, recorder, useFallbackAudio]);

  const effectiveIsRecording = Platform.OS === "web" ? (webRecording || isRecordingNative) : (useFallbackAudio ? isFallbackRecording : isRecordingNative);

  const discardRecording = useCallback(async () => {
    try { await liveTranscriptionService.abort(); } catch {}
    liveSessionRef.current = null;
    setIsTranscribing(false);
    setInterimTranscript("");

    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try { mr.stop(); } catch {}
        try { (mr.stream as any)?.getTracks?.().forEach((t: MediaStreamTrack) => t.stop()); } catch {}
      }
      mediaRecorderRef.current = null; chunksRef.current = [];
      setWebRecording(false); setIsRecordingNative(false);
      setRecordingTime(0); startTimeRef.current = 0;
      return;
    }

    if (useFallbackAudio) {
      try { if (recorderState.isRecording) await recorder.stop(); } catch {}
    }
    setIsRecordingNative(false);
    setRecordingTime(0); startTimeRef.current = 0;
  }, [recorder, recorderState.isRecording, useFallbackAudio]);

  const stopRecording = useCallback(async () => {
    const elapsed = recordingTime || Math.floor((Date.now() - startTimeRef.current) / 1000);

    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      // Stop live session first to get transcript
      let liveResult: LiveSessionResult | null = null;
      if (liveSessionRef.current) {
        try { await liveTranscriptionService.stop(); } catch {}
        try { liveResult = await liveSessionRef.current; } catch {}
        liveSessionRef.current = null;
      }
      if (mr && mr.state !== "inactive") {
        await new Promise<void>((resolve) => {
          mr.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            const url = URL.createObjectURL(blob);
            let realDuration = elapsed;
            try {
              const audio = new Audio(url);
              await new Promise<void>((res) => { audio.onloadedmetadata = () => res(); audio.onerror = () => res(); setTimeout(() => res(), 800); });
              if (audio.duration && isFinite(audio.duration)) realDuration = Math.max(elapsed, Math.round(audio.duration));
            } catch {}
            try { (mr.stream as any)?.getTracks?.().forEach((t: MediaStreamTrack) => t.stop()); } catch {}
            setWebRecording(false); setIsRecordingNative(false);
            setRecordingTime(0); startTimeRef.current = 0;
            mediaRecorderRef.current = null; chunksRef.current = [];
            // Prefer live transcript if we have it
            if (liveResult?.finalTranscript?.trim()) {
              await persistLiveResult(realDuration, { ...liveResult, audioUri: url });
            } else {
              await persistWithFileTranscription(realDuration, url);
            }
            resolve();
          };
          try { mr.stop(); } catch { resolve(); }
        });
        setInterimTranscript("");
      } else {
        setWebRecording(false); setIsRecordingNative(false);
        if (liveResult) {
          await persistLiveResult(elapsed, { ...liveResult, audioUri: null });
          setInterimTranscript("");
        }
      }
      return;
    }

    // Native — stop live session and persist (con fallback audio si persist no soportado)
    setIsTranscribing(true);
    try {
      if (useFallbackAudio) {
        // Fallback: audio viene de expo-audio, transcript de live
        let liveResult: LiveSessionResult | null = null;
        try { await liveTranscriptionService.stop(); } catch {}
        try { liveResult = liveSessionRef.current ? await liveSessionRef.current : null; } catch {}
        liveSessionRef.current = null;
        let uri: string | null = null;
        let duration = elapsed;
        try {
          if (recorderState.isRecording) await recorder.stop();
          uri = (recorder as any).uri ?? null;
          const ct = (recorder as any).currentTime;
          if (ct && isFinite(ct)) duration = Math.max(elapsed, Math.round(ct as number));
        } catch {}
        setRecordingTime(0); startTimeRef.current = 0;
        setInterimTranscript("");
        const combined: LiveSessionResult = {
          finalTranscript: liveResult?.finalTranscript ?? interimTranscript ?? null,
          audioUri: uri,
          didAbort: !!liveResult?.didAbort,
          errorCode: liveResult?.errorCode,
        };
        // Si tenemos audio aunque transcript falle, guardamos igual — nunca "no se pudo guardar audio"
        await persistLiveResult(duration, combined);
      } else {
        try { await liveTranscriptionService.stop(); } catch {}
        const result = liveSessionRef.current ? await liveSessionRef.current : { finalTranscript: interimTranscript || null, audioUri: null, didAbort: false } as LiveSessionResult;
        liveSessionRef.current = null;
        setIsRecordingNative(false);
        setRecordingTime(0); startTimeRef.current = 0;
        setInterimTranscript("");
        await persistLiveResult(elapsed, result);
      }
    } catch (e: any) {
      console.error("[recording] stop failed:", e);
      showDialog({ title: "Error", message: `No se pudo detener: ${String(e?.message ?? e)}`, variant: "info" });
      setRecordingTime(0); startTimeRef.current = 0; setIsRecordingNative(false); setInterimTranscript("");
    } finally { setIsTranscribing(false); }
  }, [recordingTime, interimTranscript, persistLiveResult, persistWithFileTranscription, showDialog, recorder, recorderState.isRecording, useFallbackAudio]);

  const toggleRecording = useCallback(async () => {
    if (effectiveIsRecording) await stopRecording();
    else await startRecording();
  }, [effectiveIsRecording, startRecording, stopRecording]);

  const cancelRecording = useCallback(async () => { await discardRecording(); }, [discardRecording]);
  const sendRecording = useCallback(async () => { await stopRecording(); }, [stopRecording]);
  const lockRecording = useCallback(() => {}, []);
  const togglePause = useCallback(async () => {}, []);

  return {
    isRecording: effectiveIsRecording,
    isLocked,
    isPaused,
    isTranscribing,
    recordingTime,
    interimTranscript,
    dialog,
    dismissDialog,
    showDialog,
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
