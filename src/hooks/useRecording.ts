import { useCallback, useRef, useState } from "react";
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
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  // Web MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isRecording = recorderState.isRecording || isRecordingFallback;

  const startRecording = useCallback(async () => {
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
      }
      return;
    }

    // Native: expo-audio
    try {
      if (!isPermissionGranted) {
        const { status } = await AudioModule.requestRecordingPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Se necesita permiso de micrófono para grabar.");
          return;
        }
        setIsPermissionGranted(true);
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert("Error", "No se pudo iniciar la grabación.");
    }
  }, [onCreated, isPermissionGranted, recorder]);

  const stopRecording = useCallback(async () => {
    // Web: parar MediaRecorder y guardar
    if (Platform.OS === "web") {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        await new Promise<void>((resolve) => {
          mr.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            const url = URL.createObjectURL(blob);
            const duration = Math.max(1, Math.round((Date.now() - (Number(mr.state === "recording") || 0)) / 1000));

            // Calcular duración real
            const audio = new Audio(url);
            await new Promise<void>((res) => {
              audio.onloadedmetadata = () => {
                res();
              };
              audio.onerror = () => res();
            });
            const realDuration = Math.max(1, Math.round(audio.duration || 3));

            await noteRepository.create({
              title: `Nota de voz ${new Date().toLocaleTimeString()}`,
              transcript: `Grabación de voz — ${new Date().toLocaleString()}`,
              audioUri: url,
              category: "Ideas",
              duration: realDuration,
            });
            setIsRecordingFallback(false);
            onCreated();
            Alert.alert("Nota creada", `Duración: ${realDuration}s`);
            resolve();
          };
          mr.stop();
        });
      } else {
        setIsRecordingFallback(false);
      }
      return;
    }

    // Native: expo-audio
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
        const uri: string | null = recorder.uri ?? null;
        const duration = Math.max(1, Math.round(recorder.currentTime ?? 3));
        await noteRepository.create({
          title: `Nota de voz ${new Date().toLocaleTimeString()}`,
          transcript: `Nota grabada — ${new Date().toLocaleString()}`,
          audioUri: uri,
          category: "Ideas",
          duration,
        });
        onCreated();
        Alert.alert("Nota creada", `Duración: ${duration}s`);
      }
    } catch (e) {
      Alert.alert("Error", String(e));
    }
  }, [recorder, recorderState.isRecording, onCreated]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) await stopRecording();
    else await startRecording();
  }, [isRecording, startRecording, stopRecording]);

  return { isRecording, toggleRecording };
}
