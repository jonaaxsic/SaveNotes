import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line, Path, Rect } from "react-native-svg";

import { Text } from "@/components/Themed";
import { ThemeToggle } from "@/components/ThemeToggle";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

function NotebookMicIcon({ color, micColor }: { color: string; micColor: string }) {
  return (
    <Svg width={190} height={190} viewBox="0 0 100 100" fill="none">
      <Rect x="25" y="12" width="50" height="72" rx="6" stroke={color} strokeWidth="3.5" fill={color} />
      <Rect x="43" y="32" width="14" height="20" rx="7" stroke={micColor} strokeWidth="3" />
      <Path d="M36 49 Q36 59 50 59 Q64 59 64 49" stroke={micColor} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Line x1="50" y1="59" x2="50" y2="66" stroke={micColor} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const { theme, isDark } = useAppTheme();

  const textColor = Colors[theme].text;
  const textSecondary = Colors[theme].textSecondary;
  const buttonBg = Colors[theme].primary;
  const buttonText = Colors[theme].primaryForeground;
  const borderColor = Colors[theme].border;
  const background = Colors[theme].background;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}>
      <View style={[styles.container, { backgroundColor: background }]}>
        <ThemeToggle style={styles.themeToggleBtn} />

        <View style={styles.content}>
          <View style={styles.iconWrapper}>
            <NotebookMicIcon color={textColor} micColor={background} />
          </View>
          <Text style={[styles.title, { color: textColor }]}>SaveNotes</Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>Tus ideas. Tu voz. Siempre contigo.</Text>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: buttonBg }]}
            activeOpacity={0.8}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={[styles.primaryButtonText, { color: buttonText }]}>Comenzar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.googleButton, { borderColor, backgroundColor: isDark ? "#222" : "#fff" }]}
            activeOpacity={0.7}
            onPress={() => {}}
          >
            <Ionicons name="logo-google" size={20} color={textColor} style={styles.googleIcon} />
            <Text style={[styles.googleButtonText, { color: textColor }]}>Iniciar sesion con Google</Text>
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: textSecondary }]}>Ya tienes una cuenta? </Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={[styles.loginLink, { color: textColor }]}>Inicia sesion</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  themeToggleBtn: { position: "absolute", top: 30, right: 24, zIndex: 1, width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 280 },
  iconWrapper: { marginBottom: 6 },
  title: { fontSize: 36, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 15, textAlign: "center" },
  bottom: { paddingBottom: 60 },
  primaryButton: { borderRadius: 30, paddingVertical: 18, alignItems: "center", marginBottom: 14 },
  primaryButtonText: { fontSize: 18, fontWeight: "600" },
  googleButton: { flexDirection: "row", borderWidth: 1, borderRadius: 30, paddingVertical: 18, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  googleIcon: { marginRight: 8 },
  googleButtonText: { fontSize: 17, fontWeight: "500" },
  loginRow: { flexDirection: "row", justifyContent: "center" },
  loginText: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: "600" },
});
