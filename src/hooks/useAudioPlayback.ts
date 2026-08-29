import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

/**
 * Singleton playback — una a la vez (RF-5).
 * Diseño SaveNotes: no copia WhatsApp visual, solo garantiza que al tocar B, A se pausa.
 */
export function useAudioPlayback() {
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Web: HTMLAudio singleton — lazy para no romper SSR
  const [htmlAudio] = useState(() => {
    if (Platform.OS === "web" && typeof Audio !== "undefined") return new Audio();
    return null;
  });

  // Native: expo-audio singleton — sin source inicial, updateInterval 200ms
  const player = useAudioPlayer(undefined as any);
  const status = useAudioPlayerStatus(player as any);

  const stop = useCallback(() => {
    if (Platform.OS === "web" && htmlAudio) {
      htmlAudio.pause();
      htmlAudio.currentTime = 0;
      htmlAudio.src = "";
    } else if (player) {
      try {
        (player as any).pause();
      } catch {}
    }
    setPlayingId(null);
  }, [player, htmlAudio]);

  const togglePlay = useCallback(
    async (id: string, uri: string | null) => {
      if (!uri) return;
      // Si es la misma nota, toggle pause/play
      if (playingId === id) {
        if (Platform.OS === "web" && htmlAudio) {
          if (!htmlAudio.paused) htmlAudio.pause();
          else await htmlAudio.play().catch(() => {});
          if (htmlAudio.paused) setPlayingId(null);
          return;
        }
        if (player) {
          const isPlaying = (status as any)?.playing ?? (player as any).playing;
          if (isPlaying) (player as any).pause();
          else (player as any).play();
          const nowPlaying = (status as any)?.playing ?? (player as any).playing;
          if (!nowPlaying) setPlayingId(null);
        }
        return;
      }

      // Otra nota: detener anterior y reproducir nueva
      stop();
      setPlayingId(id);

      if (Platform.OS === "web" && htmlAudio) {
        htmlAudio.src = uri;
        htmlAudio.currentTime = 0;
        try {
          await htmlAudio.play();
          htmlAudio.onended = () => setPlayingId(null);
          htmlAudio.onerror = () => setPlayingId(null);
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
    [playingId, player, status, htmlAudio, stop]
  );

  // Auto-limpiar al terminar (native) — en efecto, no durante render
  useEffect(() => {
    const s: any = status as any;
    if (player && s && !s.playing && playingId && s.didJustFinish) {
      setPlayingId(null);
    }
  }, [player, status, playingId]);

  return { playingId, togglePlay, stop };
}
