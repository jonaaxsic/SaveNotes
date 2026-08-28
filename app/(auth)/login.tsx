import { View, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

export default function LoginScreen() {
  const { theme } = useAppTheme();
  const c = Colors[theme];
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.background }]} edges={["top"]}>
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Iniciar sesión</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 16, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700" },
});
