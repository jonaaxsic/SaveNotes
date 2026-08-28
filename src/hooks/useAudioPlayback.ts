import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

/**
 * Singleton playback — una a la vez (RF-5).
 * Diseño SaveNotes: no copia WhatsApp visual, solo garantiza que al tocar B, A se pausa.
 */
export function useAudioPlayback() {
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Web: HTMLAudio singleton para evitar limitaciones de expo-audio en blob: urls
  const htmlAudioRef = useState(() => (Platform.OS === "web" ? new Audio() : null))[0];

  // Native: expo-audio singleton — updateInterval 200ms para progress si se necesita
  const player = useAudioPlayer(null as any, { updateInterval: 200 } as any);
  const status = player ? useAudioPlayerStatus(player as any) : null;

  const stop = useCallback(() => {
    if (Platform.OS === "web" && htmlAudioRef) {
      htmlAudioRef.pause();
      htmlAudioRef.currentTime = 0;
      htmlAudioRef.src = "";
    } else if (player) {
      try {
        (player as any).pause();
      } catch {}
    }
    setPlayingId(null);
  }, [player, htmlAudioRef]);

  const togglePlay = useCallback(
    async (id: string, uri: string | null) => {
      if (!uri) return;
      // Si es la misma nota, toggle pause/play
      if (playingId === id) {
        if (Platform.OS === "web" && htmlAudioRef) {
          if (!htmlAudioRef.paused) htmlAudioRef.pause();
          else await htmlAudioRef.play().catch(() => {});
          if (htmlAudioRef.paused) setPlayingId(null);
          return;
        }
        if (player) {
          const isPlaying = (status as any)?.playing ?? (player as any).playing;
          if (isPlaying) (player as any).pause();
          else (player as any).play();
          // Si pausó, limpiar id
          const nowPlaying = (status as any)?.playing ?? (player as any).playing;
          if (!nowPlaying) setPlayingId(null);
        }
        return;
      }

      // Otra nota: detener anterior y reproducir nueva
      stop();
      setPlayingId(id);

      if (Platform.OS === "web" && htmlAudioRef) {
        htmlAudioRef.src = uri;
        htmlAudioRef.currentTime = 0;
        try {
          await htmlAudioRef.play();
          htmlAudioRef.onended = () => setPlayingId(null);
          htmlAudioRef.onerror = () => setPlayingId(null);
        } catch {
          setPlayingId(null);
        }
        return;
      }

      // Native: replace + play (garantiza una a la vez)
      try {
        if (player && typeof (player as any).replace === "function") {
          (player as any).replace(uri);
        }
        (player as any).play();
      } catch {
        setPlayingId(null);
      }
    },
    [playingId, player, status, htmlAudioRef, stop]
  );

  // Auto-limpiar al terminar (native)
  if (player && status && !(status as any).playing && playingId && (status as any).didJustFinish) {
    // status.didJustFinish existe en AudioStatus
    setPlayingId(null);
  }

  return { playingId, togglePlay, stop };
}
