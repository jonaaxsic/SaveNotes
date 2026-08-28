import { useState } from "react";
import { StyleSheet, Text, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

type Tab = { name: string; path: string; icon: keyof typeof Ionicons.glyphMap; label: string };

const TABS: Tab[] = [
  { name: "notas", path: "/(tabs)", icon: "document-text-outline", label: "Notas" },
  { name: "ask-ia", path: "/(tabs)/ask-Ia", icon: "sparkles-outline", label: "Ask AI" },
  { name: "profile", path: "/(tabs)/profile", icon: "person-outline", label: "Perfil" },
  { name: "settings", path: "/(tabs)/settings", icon: "settings-outline", label: "Ajustes" },
];

function TabItem({ tab, isActive, theme, onPress }: { tab: Tab; isActive: boolean; theme: string; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const c = Colors[theme as "light" | "dark"];
  const color = isActive ? c.primary : c.mutedForeground;
  const bg = hovered ? c.hover : "transparent";

  return (
    <Pressable
      style={[styles.tabItem, { backgroundColor: bg }]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Ionicons name={tab.icon} size={22} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
    </Pressable>
  );
}

export default function TabBar() {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const pathname = usePathname();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <View style={[styles.bar, { backgroundColor: c.background, borderTopColor: c.border, paddingBottom: bottomPad }]}>
      {TABS.map((tab) => {
        const isActive = pathname === tab.path || (tab.path === "/(tabs)" && pathname === "/");
        return (
          <TabItem
            key={tab.name}
            tab={tab}
            isActive={isActive}
            theme={theme}
            onPress={() => router.push(tab.path as any)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
});
