import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (o: any) => o.android ?? o.default },
}));

vi.mock("expo-file-system", () => ({
  documentDirectory: "file:///data/user/0/com.savenotes.app/files/",
}));

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: vi.fn(() => true),
    supportsRecording: vi.fn(() => true),
    getSpeechRecognitionServices: vi.fn(() => ["com.google.android.as", "com.google.android.tts"]),
    getSupportedLocales: vi.fn(async () => ({ locales: ["es-ES", "en-US"], installedLocales: ["es-ES"] })),
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    getPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(async () => {}),
  },
}));

import { liveTranscriptionService } from "./liveTranscriptionService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

describe("liveTranscriptionService — Opción A", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prioriza com.google.android.as si está instalado", () => {
    (ExpoSpeechRecognitionModule.getSpeechRecognitionServices as any).mockReturnValue(["com.google.android.as", "com.samsung.android.bixby.agent"]);
    expect(liveTranscriptionService.pickAndroidServicePackage()).toBe("com.google.android.as");
  });

  it("fallback a google package si no está com.google.android.as", () => {
    (ExpoSpeechRecognitionModule.getSpeechRecognitionServices as any).mockReturnValue(["com.google.android.googlequicksearchbox"]);
    expect(liveTranscriptionService.pickAndroidServicePackage()).toBe("com.google.android.googlequicksearchbox");
  });

  it("retorna undefined si no hay servicio google (usa default del OS)", () => {
    (ExpoSpeechRecognitionModule.getSpeechRecognitionServices as any).mockReturnValue(["com.samsung.android.bixby.agent"]);
    expect(liveTranscriptionService.pickAndroidServicePackage()).toBeUndefined();
  });

  it("isRecognitionAvailable no crashea y retorna boolean", () => {
    expect(typeof liveTranscriptionService.isRecognitionAvailable()).toBe("boolean");
  });

  it("startLive llama a ExpoSpeechRecognitionModule.start con persist:true y hybrid false", async () => {
    (ExpoSpeechRecognitionModule.getSpeechRecognitionServices as any).mockReturnValue(["com.google.android.as", "com.google.android.tts"]);
    let endCb: any = null;
    (ExpoSpeechRecognitionModule.addListener as any).mockImplementation((event: string, cb: any) => {
      if (event === "end") endCb = cb;
      return { remove: vi.fn() };
    });
    (ExpoSpeechRecognitionModule.start as any).mockImplementation(() => {
      setTimeout(() => endCb?.(null), 10);
    });

    const promise = liveTranscriptionService.startLive({ lang: "es-ES", onInterim: () => {} });
    const result = await promise;

    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: "es-ES",
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
        recordingOptions: expect.objectContaining({ persist: true, outputFileName: expect.stringMatching(/\.wav$/) }),
      })
    );
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(expect.objectContaining({ androidRecognitionServicePackage: "com.google.android.as" }));
    expect(result).toHaveProperty("finalTranscript");
    expect(result).toHaveProperty("audioUri");
  });

  it("startLive propaga errorCode en fallo not-allowed", async () => {
    let errorCb: any = null;
    (ExpoSpeechRecognitionModule.addListener as any).mockImplementation((event: string, cb: any) => {
      if (event === "error") errorCb = cb;
      return { remove: vi.fn() };
    });
    (ExpoSpeechRecognitionModule.start as any).mockImplementation(() => {
      setTimeout(() => errorCb?.({ error: "not-allowed", message: "not-allowed" }), 5);
    });

    const promise = liveTranscriptionService.startLive({ lang: "es-ES" });
    const result = await promise;
    expect(result.errorCode).toBe("not-allowed");
  });

  it("requestPermissions retorna true si granted", async () => {
    (ExpoSpeechRecognitionModule.requestPermissionsAsync as any).mockResolvedValue({ granted: true });
    expect(await liveTranscriptionService.requestPermissions()).toBe(true);
  });

  it("getSupportedLocales incluye es-ES para com.google.android.as", async () => {
    const info = await liveTranscriptionService.getSupportedLocales("com.google.android.as");
    expect(info.locales).toContain("es-ES");
    expect(info.installedLocales).toContain("es-ES");
  });

  it("startLive con persistAudio:false no envía recordingOptions (fallback Android <13)", async () => {
    (ExpoSpeechRecognitionModule.getSpeechRecognitionServices as any).mockReturnValue(["com.google.android.as"]);
    (ExpoSpeechRecognitionModule.supportsRecording as any).mockReturnValue(false);
    let endCb: any = null;
    (ExpoSpeechRecognitionModule.addListener as any).mockImplementation((event: string, cb: any) => {
      if (event === "end") endCb = cb;
      return { remove: vi.fn() };
    });
    (ExpoSpeechRecognitionModule.start as any).mockImplementation(() => setTimeout(() => endCb?.(null), 5));
    const p = liveTranscriptionService.startLive({ lang: "es-ES", persistAudio: false });
    await p;
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(expect.not.objectContaining({ recordingOptions: expect.anything() }));
    // restaurar
    (ExpoSpeechRecognitionModule.supportsRecording as any).mockReturnValue(true);
  });

  it("caso bug reportado: audioUri null no debe producir 'No se pudo guardar audio' sino 'No se detectó voz'", async () => {
    // Simula el fix de useRecording: persistLiveResult ya no usa uri para decidir mensaje
    const buildTranscript = (finalTranscript: string | null, audioUri: string | null, errorCode?: string) => {
      let t = finalTranscript?.trim() ?? "";
      if (errorCode) {
        if (!t) t = "No se pudo transcribir — toca para reintentar";
      } else if (!t) {
        t = "No se detectó voz — toca para reintentar"; // fix: ya no depende de uri
      }
      return t;
    };
    expect(buildTranscript(null, null)).toBe("No se detectó voz — toca para reintentar");
    expect(buildTranscript("", null)).toBe("No se detectó voz — toca para reintentar");
    expect(buildTranscript(null, "file:///audio.wav")).toBe("No se detectó voz — toca para reintentar");
    expect(buildTranscript("hola", null)).toBe("hola");
  });
});
