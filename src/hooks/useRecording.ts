import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { noteRepository } from "@/data/SqliteNoteDataSource";
import { AudioModule, setAudioModeAsync, useAudioRecorder, RecordingPresets, useAudioRecorderState } from "expo-audio";
import * as FileSystem from "expo-file-system";
import { liveTranscriptionService, type LiveSessionResult } from "@/services/liveTranscriptionService";
import { transcriptionService } from "@/services/transcriptionService";

async function persistAudioFile(tempUri: string | null): Promise<string | null> {
  if (!tempUri) return null;
  if (tempUri.includes("/Documents/") || tempUri.includes("SaveNotes/audio")) return tempUri;
  try {
    const docs = (FileSystem as any).documentDirectory ?? null;
    if (!docs) return tempUri;
    const dir = `${docs}SaveNotes/audio/`;
    try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}
    const name = `nota_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.m4a`;
    const dest = `${dir}${name}`;
    await FileSystem.copyAsync({ from: tempUri, to: dest });
    return dest;
  } catch (e) {
    console.warn("[audio] persistAudioFile fallback to tempUri:", e);
    return tempUri;
  }
}

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

function mapTranscriptionErrorToUserMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("language-not-supported") || m.includes("language not supported")) return "Idioma no soportado — descarga el paquete es-ES en Ajustes";
  if (m.includes("not-allowed") || m.includes("permission") || m.includes("permiso")) return "Permiso denegado — activa micrófono y reconocimiento en Ajustes";
  if (m.includes("network")) return "Sin conexión — conecta a internet o descarga el modelo offline";
  if (m.includes("service-not-allowed") || m.includes("service not allowed")) return "Servicio no disponible — instala Google Speech Services";
  if (m.includes("no-speech") || m.includes("no speech")) return "No se detectó voz — toca para reintentar";
  return "No se pudo transcribir — toca para reintentar";
}

async function getAudioFileInfo(uri: string): Promise<{ exists: boolean; size: number | null }> {
  try {
    const info: any = await (FileSystem as any).getInfoAsync(uri);
    if (!info?.exists) return { exists: false, size: null };
    return { exists: true, size: typeof info.size === "number" ? info.size : null };
  } catch {
    return { exists: false, size: null };
  }
}

async function transcribeWithRetry(uri: string, maxRetries = 2): Promise<{ text: string | null; engine: string | null; error: string | null }> {
  const engine = Platform.OS === "android" ? (transcriptionService.pickAndroidServicePackage() ?? liveTranscriptionService.pickAndroidServicePackage() ?? null) : null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = attempt === 1 ? 600 : 1200;
        await new Promise((r) => setTimeout(r, backoff));
        console.log(`[transcribe] retry attempt ${attempt} for ${uri.slice(-30)}`);
      }
      let text: string | null = null;
      try {
        text = await transcriptionService.transcribeAudioFile(uri, "es-CL");
      } catch (e: any) {
        const em = String(e?.message ?? e);
        if (em.includes("language-not-supported")) {
          console.log("[transcribe] es-CL no soportado, probando es-ES");
          text = await transcriptionService.transcribeAudioFile(uri, "es-ES");
        } else throw e;
      }
      if (text?.trim()) return { text: text.trim(), engine, error: null };
      // null/empty is not a throw — but retry once in case of transient no-speech
      if (attempt < maxRetries) {
        lastError = "no-speech";
        continue;
      }
      return { text: null, engine, error: "no-speech" };
    } catch (e: any) {
      const em = String(e?.message ?? e);
      lastError = em;
      console.warn(`[transcribe] attempt ${attempt} failed:`, em);
      if (attempt === maxRetries) return { text: null, engine, error: em };
    }
  }
  return { text: null, engine, error: lastError };
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
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);
  const [speechPermissionGranted, setSpeechPermissionGranted] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ visible: false, title: "", message: "", variant: "info" });

  const [isLocked] = useState(false);
  const [isPaused] = useState(false);

  // Fase 1: expo-audio es el ÚNICO grabador en todas las plataformas nativas
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const isFallbackRecording = recorderState.isRecording || false;

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

  // Request permissions on mount — audio y speech separados
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const audioPerm = await AudioModule.getRecordingPermissionsAsync().catch(() => null);
        const speechPerm = await liveTranscriptionService.getPermissions().catch(() => null);
        const audioGranted = !!audioPerm?.granted;
        const speechGranted = !!speechPerm?.granted;
        if (!cancelled) {
          setAudioPermissionGranted(audioGranted);
          setSpeechPermissionGranted(speechGranted);
          if (audioGranted) setIsPermissionGranted(true);
          if (audioGranted && speechGranted) {
            try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}
            return;
          }
          if (audioGranted) {
            try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}
          }
        }
        try {
          const req = await liveTranscriptionService.requestPermissions().catch(() => false);
          if (!cancelled && req) {
            setSpeechPermissionGranted(true);
            setIsPermissionGranted(true);
          }
        } catch {}
        if (!audioGranted) {
          try {
            const reqAudio = await AudioModule.requestRecordingPermissionsAsync();
            if (!cancelled && reqAudio.granted) {
              setAudioPermissionGranted(true);
              setIsPermissionGranted(true);
              try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}
            }
          } catch {}
        }
        return;
      } catch (e) {
        console.error("[recording] permission check failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Timer — usa estado nativo + fallback audio unificado (Fase 1: siempre expo-audio)
  useEffect(() => {
    const isRec = Platform.OS === "web" ? (webRecording || isRecordingNative) : (isRecordingNative || isFallbackRecording);
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
  }, [isRecordingNative, isFallbackRecording, webRecording, isPaused, recordingTime]);

  useEffect(() => {
    return () => {
      liveTranscriptionService.destroy();
      transcriptionService.destroy().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Fase 2: helper que guarda nota con Transcribiendo y luego actualiza con resultado real
  const persistWithFileTranscription = useCallback(async (durationSec: number, rawUri: string | null, audioSize: number | null, engine: string | null) => {
    const duration = Math.max(1, Math.round(durationSec));
    const uri = await persistAudioFile(rawUri);
    // Si no hay uri en absoluto, crear nota de error igualmente para que usuario vea que se intentó
    if (!uri) {
      const msg = "No se pudo guardar el audio — intenta de nuevo";
      await noteRepository.create({ title: `Nota de voz ${new Date().toLocaleTimeString()}`, transcript: msg, audioUri: null, category: "Ideas", duration, audioSize, transcriptionEngine: engine, transcriptionError: "no-uri" } as any);
      onCreated();
      return;
    }
    // Crear nota inmediata con Transcribiendo para feedback instantáneo (Fase 2)
    let noteId: string | null = null;
    try {
      const created = await noteRepository.create({ title: `Nota de voz ${new Date().toLocaleTimeString()}`, transcript: "Transcribiendo…", audioUri: uri, category: "Ideas", duration, audioSize, transcriptionEngine: engine, transcriptionError: null } as any);
      noteId = (created as any).id ?? null;
      onCreated();
    } catch (e) {
      console.error("[recording] create Transcribiendo failed:", e);
      await noteRepository.create({ title: `Nota de voz ${new Date().toLocaleTimeString()}`, transcript: "Transcribiendo…", audioUri: uri, category: "Ideas", duration, audioSize, transcriptionEngine: engine, transcriptionError: null } as any);
      onCreated();
      // buscar última nota como fallback
      const all = await noteRepository.getAll().catch(() => [] as any);
      noteId = all[0]?.id ?? null;
    }

    if (!noteId) {
      // No se pudo obtener id, hacer flujo antiguo directo
      setIsTranscribing(true);
      try {
        const { text, error } = await transcribeWithRetry(uri);
        const finalTranscript = text?.trim() ? text.trim() : mapTranscriptionErrorToUserMessage(error ?? "no-speech");
        const isError = finalTranscript.includes("reintentar") || finalTranscript.startsWith("No se") || finalTranscript.startsWith("Permiso") || finalTranscript.startsWith("Sin conexión") || finalTranscript.startsWith("Servicio") || finalTranscript.startsWith("Idioma");
        const finalTitle = !isError && finalTranscript ? buildTitleFromTranscript(finalTranscript) : `Nota de voz ${new Date().toLocaleTimeString()}`;
        // actualizar la última creada (no tenemos id, así que no podemos — crear otra)
        await noteRepository.create({ title: finalTitle, transcript: finalTranscript, audioUri: uri, category: "Ideas", duration, audioSize, transcriptionEngine: engine, transcriptionError: error } as any);
        onCreated();
      } catch (e: any) {
        const msg = mapTranscriptionErrorToUserMessage(String(e?.message ?? e));
        await noteRepository.create({ title: `Nota de voz ${new Date().toLocaleTimeString()}`, transcript: msg, audioUri: uri, category: "Ideas", duration, audioSize, transcriptionEngine: engine, transcriptionError: String(e?.message ?? e) } as any);
        onCreated();
      } finally { setIsTranscribing(false); }
      return;
    }

    // Transcribir en segundo plano con reintentos y luego actualizar la nota existente
    setIsTranscribing(true);
    try {
      const { text, error } = await transcribeWithRetry(uri);
      const finalTranscript = text?.trim() ? text.trim() : mapTranscriptionErrorToUserMessage(error ?? "no-speech");
      const isError = finalTranscript.includes("reintentar") || finalTranscript.startsWith("No se") || finalTranscript.startsWith("Permiso") || finalTranscript.startsWith("Sin conexión") || finalTranscript.startsWith("Servicio") || finalTranscript.startsWith("Idioma");
      const finalTitle = !isError && finalTranscript ? buildTitleFromTranscript(finalTranscript) : `Nota de voz ${new Date().toLocaleTimeString()}`;
      await noteRepository.update(noteId, { title: finalTitle, transcript: finalTranscript, audioSize, transcriptionEngine: engine, transcriptionError: error } as any);
      onCreated();
    } catch (e: any) {
      const em = String(e?.message ?? e);
      const userMsg = mapTranscriptionErrorToUserMessage(em);
      try { await noteRepository.update(noteId, { transcript: userMsg, transcriptionError: em } as any); } catch {}
      onCreated();
    } finally { setIsTranscribing(false); }
  }, [onCreated]);

  const startRecording = useCallback(async () => {
    setRecordingTime(0);
    setInterimTranscript("");
    startTimeRef.current = Date.now();

    // Web path — MediaRecorder + live interim opcional
    if (Platform.OS === "web") {
      const canLive = liveTranscriptionService.isRecognitionAvailable();
      if (canLive) {
        try {
          setIsRecordingNative(true);
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mr = new MediaRecorder(stream);
          chunksRef.current = [];
          mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
          mr.start();
          mediaRecorderRef.current = mr;
          setWebRecording(true);
          const livePromise = liveTranscriptionService.startLive({
            lang: "es-CL",
            persistAudio: false,
            onInterim: (t) => setInterimTranscript(t),
          });
          livePromise.catch(() => {});
          liveSessionRef.current = livePromise;
          return;
        } catch (e) {
          console.error("[recording] web live start failed, fallback to MediaRecorder only:", e);
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

    // Native path — Fase 1: expo-audio es el grabador principal SIEMPRE
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

    const recognitionAvailable = (() => {
      try { return liveTranscriptionService.isRecognitionAvailable(); } catch (e) { console.error("[speech] isRecognitionAvailable falló:", e); return false; }
    })();
    if (!recognitionAvailable) {
      console.warn("[speech] Reconocimiento no disponible. El audio se grabará igualmente.");
    }

    try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch (e) { console.error("[recording] setAudioMode failed:", e); }

    if (Platform.OS === "android") {
      const pkg = liveTranscriptionService.pickAndroidServicePackage();
      console.log("[recording] Android service package:", pkg ?? "(default)", "available:", liveTranscriptionService.getAvailableServices(), "supportsRecording:", liveTranscriptionService.supportsRecording());
    }

    // Fase 1: preparar y grabar con expo-audio — nunca bloquear por STT
    try {
      await recorder.prepareToRecordAsync();
    } catch (e) {
      console.error("[recording] prepareToRecordAsync failed:", e);
      showDialog({ title: "Error", message: `No se pudo preparar la grabación: ${String((e as any)?.message ?? e)}`, variant: "info" });
      setRecordingTime(0); startTimeRef.current = 0;
      return;
    }
    try {
      recorder.record();
      setIsRecordingNative(true);
    } catch (e) {
      console.error("[recording] recorder.record failed:", e);
      showDialog({ title: "Error", message: `No se pudo iniciar la grabación: ${String((e as any)?.message ?? e)}`, variant: "info" });
      setRecordingTime(0); startTimeRef.current = 0;
      return;
    }

    // Fase 2: live caption opcional solo para feedback visual — persistAudio:false, no es fuente de verdad
    if (recognitionAvailable) {
      try {
        const livePromise = liveTranscriptionService.startLive({
          lang: "es-CL",
          persistAudio: false,
          onInterim: (text) => setInterimTranscript(text),
        });
        livePromise.catch(() => {});
        liveSessionRef.current = livePromise;
      } catch (e) {
        console.warn("[recording] live interim start failed (no bloquea grabación):", e);
        liveSessionRef.current = null;
      }
    }
  }, [isPermissionGranted, showDialog, recorder]);

  const effectiveIsRecording = Platform.OS === "web" ? (webRecording || isRecordingNative) : (isRecordingNative || isFallbackRecording);

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

    try { if (recorderState.isRecording) await recorder.stop(); } catch {}
    setIsRecordingNative(false);
    setRecordingTime(0); startTimeRef.current = 0;
  }, [recorder, recorderState.isRecording]);

  const stopRecording = useCallback(async () => {
    const elapsed = recordingTime || Math.floor((Date.now() - startTimeRef.current) / 1000);

    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      let liveResult: LiveSessionResult | null = null;
      if (liveSessionRef.current) {
        try { await liveTranscriptionService.stop(); } catch {}
        try { liveResult = await Promise.race([liveSessionRef.current, new Promise<null>((res) => setTimeout(() => res(null), 1500))]) as any; } catch {}
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
            const engine = (liveTranscriptionService as any).pickAndroidServicePackage?.() ?? null;
            if (liveResult?.finalTranscript?.trim()) {
              // Aun en web preferimos file-based si hay audio real
              await persistWithFileTranscription(realDuration, url, null, engine);
            } else {
              await persistWithFileTranscription(realDuration, url, null, engine);
            }
            resolve();
          };
          try { mr.stop(); } catch { resolve(); }
        });
        setInterimTranscript("");
      } else {
        setWebRecording(false); setIsRecordingNative(false);
        if (liveResult) {
          setInterimTranscript("");
          // sin audio real, usar file path nulo
          await persistWithFileTranscription(elapsed, null, null, null);
        }
      }
      return;
    }

    // Native — Fase 1+2: audio siempre viene de expo-audio, transcripción file-based con retry
    setIsTranscribing(true);
    try {
      // Detener live interim con timeout corto (no es fuente de verdad)
      try { await liveTranscriptionService.stop(); } catch {}
      try {
        if (liveSessionRef.current) {
          await Promise.race([liveSessionRef.current, new Promise<null>((res) => setTimeout(() => res(null), 1200))]);
        }
      } catch {}
      liveSessionRef.current = null;

      let uri: string | null = null;
      let duration = elapsed;
      let audioSize: number | null = null;
      const engine = liveTranscriptionService.pickAndroidServicePackage() ?? transcriptionService.pickAndroidServicePackage() ?? null;

      try {
        // recorder.stop() es necesario para liberar el archivo
        if (recorderState.isRecording || isRecordingNative) {
          await recorder.stop();
        }
        // expo-audio 57: recorder.uri puede estar en .uri o en getStatus
        uri = (recorder as any).uri ?? (recorder as any).getStatus?.()?.uri ?? null;
        // fallback: algunos presets usan .uri async
        if (!uri) {
          try { const s: any = await (recorder as any).getStatus?.(); if (s?.uri) uri = s.uri; } catch {}
        }
        const ct = (recorder as any).currentTime ?? (recorder as any).duration ?? null;
        if (typeof ct === "number" && isFinite(ct) && ct > 0) duration = Math.max(elapsed, Math.round(ct));
        else {
          const s: any = await (recorder as any).getStatus?.().catch(() => null);
          if (s?.duration && isFinite(s.duration)) duration = Math.max(elapsed, Math.round(s.duration));
        }
      } catch (e) {
        console.warn("[recording] recorder.stop fallback:", e);
      }

      setIsRecordingNative(false);
      setRecordingTime(0); startTimeRef.current = 0;
      setInterimTranscript("");

      // Fase 1 validación: tamaño mínimo según duración
      if (uri) {
        const info = await getAudioFileInfo(uri);
        audioSize = info.size;
        if (!info.exists) {
          console.warn("[recording] audio file no existe tras stop:", uri);
          uri = null;
        } else if (audioSize !== null) {
          const minBytes = Math.max(2000, duration * 3000);
          if (audioSize < minBytes) {
            console.warn("[recording] audio sospechosamente pequeño:", audioSize, "min:", minBytes, "dur:", duration);
            // no descartamos, pero lo loggeamos y guardamos metadata para Fase 4 diagnóstico
          }
        }
      } else {
        console.warn("[recording] no uri from expo-audio, duración:", duration);
      }

      await persistWithFileTranscription(duration, uri, audioSize, engine);
    } catch (e: any) {
      console.error("[recording] stop failed:", e);
      showDialog({ title: "Error", message: `No se pudo detener: ${String(e?.message ?? e)}`, variant: "info" });
      setRecordingTime(0); startTimeRef.current = 0; setIsRecordingNative(false); setInterimTranscript("");
    } finally { setIsTranscribing(false); }
  }, [recordingTime, interimTranscript, persistWithFileTranscription, showDialog, recorder, recorderState.isRecording, isRecordingNative]);

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
