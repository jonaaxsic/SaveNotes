import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";
import { ModernDialog } from "@/components/ModernDialog";
import { liveTranscriptionService } from "@/services/liveTranscriptionService";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

export default function SettingsScreen() {
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const background = c.background;
  const textColor = c.text;
  const borderColor = c.border;

  const [serviceInfo, setServiceInfo] = useState<{ pkg?: string; services: string[]; available: boolean; supportsRecording: boolean }>({ services: [], available: false, supportsRecording: false });
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [localeInfo, setLocaleInfo] = useState<{ locales: string[]; installedLocales: string[] } | null>(null);
  const [dialog, setDialog] = useState<{ visible: boolean; title: string; message: string }>({ visible: false, title: "", message: "" });

  useEffect(() => {
    (async () => {
      try {
        const granted = await liveTranscriptionService.getPermissions();
        setPermGranted(!!granted.granted);
      } catch { setPermGranted(null); }
      try {
        const pkg = liveTranscriptionService.pickAndroidServicePackage();
        const services = liveTranscriptionService.getAvailableServices();
        const available = liveTranscriptionService.isRecognitionAvailable();
        const supportsRecording = liveTranscriptionService.supportsRecording();
        setServiceInfo({ pkg, services, available, supportsRecording });
        // Fetch locales for es-ES
        if (Platform.OS === "android" || Platform.OS === "ios") {
          try {
            const info = await liveTranscriptionService.getSupportedLocales(pkg);
            setLocaleInfo(info);
          } catch {}
        }
      } catch {}
    })();
  }, []);

  const handleRequestPermission = async () => {
    const ok = await liveTranscriptionService.requestPermissions();
    setPermGranted(ok);
    if (!ok) setDialog({ visible: true, title: "Permiso denegado", message: "Activa micrófono y reconocimiento en Ajustes → Apps → SaveNotes → Permisos." });
    else setDialog({ visible: true, title: "Permiso concedido", message: "Ya podés grabar y transcribir." });
  };

  const handleDownloadModel = async () => {
    if (Platform.OS !== "android") {
      setDialog({ visible: true, title: "Solo Android", message: "En iOS el modelo se descarga automáticamente desde Ajustes del sistema." });
      return;
    }
    try {
      const res = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: "es-ES" });
      setDialog({ visible: true, title: "Descarga modelo", message: `${res.status}: ${res.message}` });
    } catch (e: any) {
      setDialog({ visible: true, title: "Error", message: String(e?.message ?? e) });
    }
  };

  const serviceLabel = serviceInfo.pkg ? serviceInfo.pkg : serviceInfo.services.length ? "Default del sistema" : "No detectado";
  const esSupported = localeInfo ? localeInfo.locales.includes("es-ES") || localeInfo.locales.includes("es") : null;
  const esInstalled = localeInfo ? localeInfo.installedLocales.includes("es-ES") : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]} edges={["top"]}>
      <ScrollView style={[styles.container, { backgroundColor: background }]} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={[styles.title, { color: textColor }]}>Ajustes</Text>
        <Text style={[styles.sub, { color: c.mutedForeground }]}>Configuración de la app</Text>

        <View style={[styles.card, { borderColor, backgroundColor: c.card }]}>
          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={20} color={textColor} />
            <Text style={[styles.rowText, { color: textColor }]}>Notificaciones</Text>
            <Ionicons name="chevron-forward" size={18} color={c.mutedForeground} style={styles.chevron} />
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.row}>
            <Ionicons name="language-outline" size={20} color={textColor} />
            <Text style={[styles.rowText, { color: textColor }]}>Idioma</Text>
            <Text style={[styles.rowValue, { color: c.mutedForeground }]}>Español (es-ES)</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={20} color={textColor} />
            <Text style={[styles.rowText, { color: textColor }]}>Acerca de</Text>
            <Text style={[styles.rowValue, { color: c.mutedForeground }]}>SaveNotes 1.0.0</Text>
          </View>
        </View>

        {/* Voz y transcripción — Option A live */}
        <Text style={[styles.sectionTitle, { color: textColor }]}>Voz y transcripción</Text>
        <Text style={[styles.sectionSub, { color: c.mutedForeground }]}>Gratis, sin pagos. Prioriza com.google.android.as si está instalado.</Text>

        <View style={[styles.card, { borderColor, backgroundColor: c.card }]}>
          <View style={styles.row}>
            <Ionicons name={permGranted ? "checkmark-circle" : "alert-circle-outline"} size={20} color={permGranted ? c.primary : c.destructive} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowText, { color: textColor }]}>Permiso micrófono + voz</Text>
              <Text style={[styles.rowHint, { color: c.mutedForeground }]}>{permGranted === null ? "Verificando…" : permGranted ? "Concedido" : "No concedido — toca para pedir"}</Text>
            </View>
            {!permGranted && (
              <Pressable onPress={handleRequestPermission} style={[styles.actionBtn, { backgroundColor: c.primary }]}>
                <Text style={[styles.actionText, { color: c.primaryForeground }]}>Permitir</Text>
              </Pressable>
            )}
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />

          <View style={styles.row}>
            <Ionicons name="hardware-chip-outline" size={20} color={textColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowText, { color: textColor }]}>Servicio de reconocimiento</Text>
              <Text style={[styles.rowHint, { color: c.mutedForeground }]} numberOfLines={2}>{serviceLabel}</Text>
              {Platform.OS === "android" && serviceInfo.services.length > 0 && (
                <Text style={[styles.rowHint, { color: c.mutedForeground, fontSize: 11 }]} numberOfLines={2}>Disponibles: {serviceInfo.services.join(", ")}</Text>
              )}
            </View>
            <View style={[styles.badge, { backgroundColor: serviceInfo.available ? "rgba(14,165,166,0.12)" : "rgba(229,57,53,0.12)", borderColor: serviceInfo.available ? c.primary : c.destructive }]}>
              <Text style={[styles.badgeText, { color: serviceInfo.available ? c.primary : c.destructive }]}>{serviceInfo.available ? "Disponible" : "No disponible"}</Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />

          <View style={styles.row}>
            <Ionicons name="mic-outline" size={20} color={textColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowText, { color: textColor }]}>Audio persistido (.wav)</Text>
              <Text style={[styles.rowHint, { color: c.mutedForeground }]}>{serviceInfo.supportsRecording ? "Soportado (Android 13+ / iOS)" : Platform.OS === "web" ? "Web: vía navegador" : "Requiere Android 13+ para guardar wav"}</Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />

          <View style={styles.row}>
            <Ionicons name="globe-outline" size={20} color={textColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowText, { color: textColor }]}>Español es-ES</Text>
              <Text style={[styles.rowHint, { color: c.mutedForeground }]}>
                {localeInfo ? (esSupported ? (esInstalled ? "Instalado offline ✓" : "Soportado (online) — descarga offline opcional") : "No soportado en este servicio") : "Verificando…"}
              </Text>
            </View>
            {Platform.OS === "android" && (
              <Pressable onPress={handleDownloadModel} style={[styles.actionBtn, { backgroundColor: c.muted, borderWidth: 1, borderColor: c.border }]}>
                <Text style={[styles.actionText, { color: textColor }]}>Descargar offline</Text>
              </Pressable>
            )}
          </View>
        </View>

        <Text style={[styles.footNote, { color: c.mutedForeground }]}>
          Modo híbrido (online + offline). Si no hay internet, usa el modelo offline si está instalado. No requiere pagos ni API keys.
        </Text>
      </ScrollView>

      <ModernDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        variant="info"
        onConfirm={() => setDialog({ ...dialog, visible: false })}
        onClose={() => setDialog({ ...dialog, visible: false })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 24 },
  sectionSub: { fontSize: 12, marginTop: 4 },
  card: { marginTop: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 12 },
  rowText: { fontSize: 15, fontWeight: "500", flex: 1 },
  rowHint: { fontSize: 12, marginTop: 2 },
  rowValue: { fontSize: 13 },
  chevron: { marginLeft: "auto" },
  divider: { height: 1, opacity: 0.5 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  actionText: { fontSize: 13, fontWeight: "600" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  footNote: { fontSize: 11, marginTop: 12, lineHeight: 16, textAlign: "center" },
});
