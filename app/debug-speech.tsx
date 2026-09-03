import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AudioModule } from "expo-audio";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";
import { liveTranscriptionService } from "@/services/liveTranscriptionService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

type Diagnostics = {
  audioPermission: boolean | null;
  speechPermission: boolean | null;
  speechCanAskAgain: boolean | null;
  recognitionAvailable: boolean | null;
  supportsRecording: boolean | null;
  services: string[];
  pickedService?: string;
  locales: string[];
  installedLocales: string[];
  error?: string;
};

export default function DebugSpeechScreen() {
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const [diag, setDiag] = useState<Diagnostics>({
    audioPermission: null,
    speechPermission: null,
    speechCanAskAgain: null,
    recognitionAvailable: null,
    supportsRecording: null,
    services: [],
    locales: [],
    installedLocales: [],
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = async () => {
    try {
      const audioPerm = await AudioModule.getRecordingPermissionsAsync().catch(() => null);
      const speechPerm = await liveTranscriptionService.getPermissions().catch(() => null);
      let recognitionAvailable: boolean | null = null;
      let supportsRecording: boolean | null = null;
      let services: string[] = [];
      let picked: string | undefined;
      try { recognitionAvailable = liveTranscriptionService.isRecognitionAvailable(); } catch (e: any) { console.error("[debug] isRecognitionAvailable falló:", e); recognitionAvailable = false; }
      try { supportsRecording = liveTranscriptionService.supportsRecording(); } catch { supportsRecording = false; }
      try { services = liveTranscriptionService.getAvailableServices(); } catch {}
      try { picked = liveTranscriptionService.pickAndroidServicePackage(); } catch {}
      let locales: string[] = [];
      let installedLocales: string[] = [];
      try {
        const info = await liveTranscriptionService.getSupportedLocales(picked);
        locales = info.locales ?? [];
        installedLocales = info.installedLocales ?? [];
      } catch {}
      setDiag({
        audioPermission: audioPerm ? !!audioPerm.granted : null,
        speechPermission: speechPerm ? !!speechPerm.granted : null,
        speechCanAskAgain: speechPerm ? !!speechPerm.canAskAgain : null,
        recognitionAvailable,
        supportsRecording,
        services,
        pickedService: picked,
        locales,
        installedLocales,
      });
    } catch (e: any) {
      setDiag((p) => ({ ...p, error: String(e?.message ?? e) }));
    }
  };

  useEffect(() => { load(); }, []);

  const requestPermissions = async () => {
    try {
      const ok = await liveTranscriptionService.requestPermissions();
      setTestResult(ok ? "Permiso concedido" : "Permiso denegado");
      await load();
    } catch (e: any) { setTestResult(String(e?.message ?? e)); }
  };

  const testSpeech = async () => {
    setTesting(true);
    setTestResult("Probando es-CL 3s...");
    try {
      const p = liveTranscriptionService.startLive({
        lang: "es-CL",
        persistAudio: false,
        onInterim: (t) => setTestResult(`Interim: ${t}`),
      });
      setTimeout(async () => {
        try { await liveTranscriptionService.stop(); } catch {}
        try {
          const r: any = await Promise.race([p, new Promise((res) => setTimeout(() => res(null), 4000))]);
          if (r?.finalTranscript) setTestResult(`Final: ${r.finalTranscript}`);
          else setTestResult("Sin transcript (habla más fuerte o revisa idioma)");
        } catch (e: any) { setTestResult(String(e?.message ?? e)); }
        setTesting(false);
      }, 3000);
    } catch (e: any) { setTestResult(String(e?.message ?? e)); setTesting(false); }
  };

  const triggerDownload = async () => {
    if (Platform.OS !== "android") { setTestResult("Solo Android"); return; }
    try {
      const res: any = await (ExpoSpeechRecognitionModule as any).androidTriggerOfflineModelDownload({ locale: "es-CL" });
      setTestResult(`${res.status}: ${res.message}`);
    } catch (e: any) { setTestResult(String(e?.message ?? e)); }
  };

  const Row = ({ label, value, ok }: { label: string; value: string; ok?: boolean | null }) => (
    <View style={[styles.row, { borderColor: c.border }]}>
      <Text style={[styles.label, { color: c.mutedForeground }]}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
        {ok !== undefined && ok !== null && <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={16} color={ok ? c.primary : c.destructive} />}
        <Text style={[styles.value, { color: c.text }]} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: c.text }]}>Diagnóstico Voz</Text>
        <Text style={[styles.sub, { color: c.mutedForeground }]}>No modifica grabación. Solo lectura para Fase 4.</Text>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Row label="Mic permiso" value={diag.audioPermission === null ? "..." : diag.audioPermission ? "true" : "false"} ok={diag.audioPermission} />
          <Row label="Speech permiso" value={diag.speechPermission === null ? "..." : diag.speechPermission ? "true" : "false"} ok={diag.speechPermission} />
          <Row label="Puede pedir de nuevo" value={diag.speechCanAskAgain === null ? "..." : diag.speechCanAskAgain ? "true" : "false"} />
          <Row label="Recognition available" value={diag.recognitionAvailable === null ? "..." : String(diag.recognitionAvailable)} ok={diag.recognitionAvailable} />
          <Row label="Supports recording" value={diag.supportsRecording === null ? "..." : String(diag.supportsRecording)} ok={diag.supportsRecording} />
          <Row label="Servicio" value={diag.pickedService ?? (diag.services.length ? diag.services[0] : "No detectado")} />
          {diag.services.length > 1 && <Row label="Todos" value={diag.services.join(", ")} />}
          <Row label="Locales soportados" value={diag.locales.length ? diag.locales.slice(0, 8).join(", ") : "vacío"} />
          <Row label="Locales instalados" value={diag.installedLocales.length ? diag.installedLocales.join(", ") : "ninguno"} />
          <Row label="Idioma probado" value="es-CL → es-ES fallback" />
          {diag.error && <Text style={[styles.error, { color: c.destructive }]}>{diag.error}</Text>}
        </View>

        <View style={styles.btns}>
          <Pressable style={[styles.btn, { backgroundColor: c.primary }]} onPress={requestPermissions}>
            <Text style={[styles.btnText, { color: c.primaryForeground }]}>Solicitar permiso</Text>
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]} onPress={load}>
            <Text style={[styles.btnText, { color: c.text }]}>Recargar</Text>
          </Pressable>
        </View>
        <View style={styles.btns}>
          <Pressable style={[styles.btn, { backgroundColor: testing ? c.muted : c.primary, opacity: testing ? 0.6 : 1 }]} onPress={testSpeech} disabled={testing}>
            <Text style={[styles.btnText, { color: c.primaryForeground }]}>{testing ? "Probando..." : "Probar Speech 3s"}</Text>
          </Pressable>
          {Platform.OS === "android" && (
            <Pressable style={[styles.btn, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]} onPress={triggerDownload}>
              <Text style={[styles.btnText, { color: c.text }]}>Descargar modelo es-CL</Text>
            </Pressable>
          )}
        </View>
        {testResult && (
          <View style={[styles.result, { backgroundColor: c.muted, borderColor: c.border }]}>
            <Text style={[styles.resultText, { color: c.text }]}>{testResult}</Text>
          </View>
        )}
        <Text style={[styles.hint, { color: c.mutedForeground }]}>
          Logs detallados en adb logcat con [debug] / [speech] / [recording]. Esta pantalla no inicia recorder, no crea notas, no borra nada.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: -8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 0.5, gap: 12 },
  label: { fontSize: 12, flex: 0.45 },
  value: { fontSize: 12, fontWeight: "600", textAlign: "right", flex: 0.55 },
  error: { fontSize: 12, marginTop: 8 },
  btns: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  btnText: { fontSize: 13, fontWeight: "600" },
  result: { borderWidth: 1, borderRadius: 10, padding: 12 },
  resultText: { fontSize: 13 },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
});
