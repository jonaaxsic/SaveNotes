import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

export type VoicePermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
};

export interface VoicePermissionService {
  get(): Promise<VoicePermissionResult>;
  request(): Promise<VoicePermissionResult>;
}

export class ExpoVoicePermissionService implements VoicePermissionService {
  async get(): Promise<VoicePermissionResult> {
    try {
      const res = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      return { granted: !!res.granted, canAskAgain: !!res.canAskAgain };
    } catch {
      return { granted: false, canAskAgain: true };
    }
  }

  async request(): Promise<VoicePermissionResult> {
    try {
      const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return { granted: !!res.granted, canAskAgain: !!res.canAskAgain };
    } catch {
      return { granted: false, canAskAgain: false };
    }
  }

  isRecognitionAvailable(): boolean {
    if (Platform.OS === "web") return true;
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  }

  supportsRecording(): boolean {
    if (Platform.OS === "web") return false;
    try {
      return ExpoSpeechRecognitionModule.supportsRecording();
    } catch {
      return false;
    }
  }

  getAvailableServices(): string[] {
    if (Platform.OS !== "android") return [];
    try {
      return ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
    } catch {
      return [];
    }
  }

  pickAndroidServicePackage(): string | undefined {
    if (Platform.OS !== "android") return undefined;
    try {
      const services: string[] = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      if (services.includes("com.google.android.googlequicksearchbox")) return "com.google.android.googlequicksearchbox";
      const google = services.find((s) => s.includes("google") && s !== "com.google.android.as");
      if (google) return google;
      if (services.includes("com.google.android.as")) return "com.google.android.as";
      return undefined;
    } catch {
      return undefined;
    }
  }

  async getSupportedLocales(pkg?: string) {
    try {
      return await ExpoSpeechRecognitionModule.getSupportedLocales({
        androidRecognitionServicePackage: pkg,
      });
    } catch {
      return { locales: [], installedLocales: [] };
    }
  }
}

export const voicePermissionService = new ExpoVoicePermissionService();
