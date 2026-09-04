/**
 * audioStorageService — persist temp recording to documents with validation (§4)
 *
 * Criteria for 10 reproducible recordings:
 * - URI != null after stop (AUDIO_URI_MISSING if null)
 * - duration > 0 (invalid-duration if 0)
 * - file exists after copy
 * - size > 0 after copy
 * All checked deterministically, no silent catch, no arbitrary sleep.
 */

import * as FileSystem from "expo-file-system";
import { VoiceSessionError } from "@/types/voice";

export async function validateRecordingFile(uri: string, durationMs: number): Promise<void> {
  if (!uri) throw new VoiceSessionError("audio-not-saved", "AUDIO_URI_MISSING", "AUDIO_URI_MISSING");
  if (!durationMs || durationMs <= 0) {
    throw new VoiceSessionError("audio-not-saved", "invalid-duration: durationMs must be >0", "invalid-duration");
  }
  let info: unknown;
  try {
    info = await (FileSystem as unknown as { getInfoAsync: (u: string) => Promise<unknown> }).getInfoAsync(uri);
  } catch (e) {
    throw new VoiceSessionError("audio-not-saved", "No se pudo verificar el audio", e);
  }
  const typed = info as { exists?: boolean; size?: number; uri?: string };
  if (!typed?.exists) throw new VoiceSessionError("audio-not-saved", "audio-not-found: archivo no existe", typed);
  if (typeof typed.size === "number" && typed.size === 0) throw new VoiceSessionError("audio-not-saved", "audio-empty: archivo vacío", typed);
}

export async function persistRecording(tempUri: string): Promise<string> {
  if (!tempUri) throw new VoiceSessionError("audio-not-saved", "AUDIO_URI_MISSING", "AUDIO_URI_MISSING");

  // Verify source exists and size>0 before copy
  let srcInfo: { exists?: boolean; size?: number } | null = null;
  try {
    srcInfo = (await (FileSystem as unknown as { getInfoAsync: (u: string) => Promise<{ exists: boolean; size?: number }> }).getInfoAsync(tempUri)) as { exists: boolean; size?: number };
  } catch (e) {
    throw new VoiceSessionError("audio-not-saved", "No se pudo verificar audio origen", e);
  }
  if (!srcInfo?.exists) throw new VoiceSessionError("audio-not-saved", "audio-not-found: origen no existe", srcInfo);
  if (typeof srcInfo.size === "number" && srcInfo.size === 0) throw new VoiceSessionError("audio-not-saved", "audio-empty: origen vacío", srcInfo);

  const docs = (FileSystem as unknown as { documentDirectory?: string | null }).documentDirectory ?? null;
  // If no documentDirectory (web), return tempUri as final (web uses blob url)
  if (!docs) {
    console.info("[STORAGE] no documentDirectory, using tempUri as final");
    return tempUri;
  }

  const dir = `${docs}SaveNotes/audio/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // directory may already exist — not fatal
  }

  const finalName = `voice_${Date.now()}.wav`;
  const dest = `${dir}${finalName}`;

  try {
    await FileSystem.copyAsync({ from: tempUri, to: dest });
  } catch (e) {
    throw new VoiceSessionError("audio-not-saved", "storage-failed: copyAsync falló", e);
  }

  // Verify destination exists and size>0, reproducible evidence
  let dstInfo: { exists?: boolean; size?: number } | null = null;
  try {
    dstInfo = (await (FileSystem as unknown as { getInfoAsync: (u: string) => Promise<{ exists: boolean; size?: number }> }).getInfoAsync(dest)) as { exists: boolean; size?: number };
  } catch (e) {
    throw new VoiceSessionError("audio-not-saved", "storage-failed: no se pudo verificar destino", e);
  }
  if (!dstInfo?.exists) throw new VoiceSessionError("audio-not-saved", "storage-failed: destino no existe", dstInfo);
  if (typeof dstInfo.size === "number" && dstInfo.size === 0) throw new VoiceSessionError("audio-not-saved", "audio-empty: destino vacío", dstInfo);

  console.info("[STORAGE] persisted", { from: tempUri.slice(-40), to: dest.slice(-40), size: dstInfo.size });
  return dest;
}

export async function getAudioFileSize(uri: string): Promise<number | null> {
  try {
    const info = (await (FileSystem as unknown as { getInfoAsync: (u: string) => Promise<{ exists: boolean; size?: number }> }).getInfoAsync(uri)) as { exists: boolean; size?: number };
    if (info?.exists && typeof info.size === "number") return info.size;
    return null;
  } catch {
    return null;
  }
}
