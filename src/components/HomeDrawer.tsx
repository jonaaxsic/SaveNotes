import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

const { width: SCREEN_W } = Dimensions.get("window");
const DRAWER_W = Math.min(SCREEN_W * 0.62, 240);
const ANIM_DUR = 280;

type Props = {
  visible: boolean;
  onClose: () => void;
  onOrganize: () => void;
  onCalendar: () => void;
  onCreateManual: () => void;
  onSettings: () => void;
  onExit: () => void;
};

type MenuItem = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void };

function DrawerItem({ item, theme }: { item: MenuItem; theme: string }) {
  const [hovered, setHovered] = useState(false);
  const c = Colors[theme as "light" | "dark"];
  const bg = hovered ? c.hover : "transparent";

  return (
    <Pressable
      style={[styles.menuItem, { backgroundColor: bg }]}
      onPress={item.onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Ionicons name={item.icon} size={20} color={c.text} />
      <Text style={[styles.menuLabel, { color: c.text }]}>{item.label}</Text>
    </Pressable>
  );
}

export default function HomeDrawer({ visible, onClose, onOrganize, onCalendar, onCreateManual, onSettings, onExit }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, toggle } = useAppTheme();
  const c = Colors[theme];
  const slideX = useRef(new Animated.Value(-DRAWER_W)).current;

  const menuItems: MenuItem[] = [
    { icon: "swap-vertical-outline", label: "Organizar", onPress: onOrganize },
    { icon: "calendar-outline", label: "Ver por mes", onPress: onCalendar },
    { icon: "create-outline", label: "Crear nota manual", onPress: onCreateManual },
    { icon: "settings-outline", label: "Configuración", onPress: onSettings },
    { icon: "log-out-outline", label: "Cerrar sesión", onPress: onExit },
  ];

  useEffect(() => {
    Animated.timing(slideX, {
      toValue: visible ? 0 : -DRAWER_W,
      duration: ANIM_DUR,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" as any }]}>
      {/* Overlay */}
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)", opacity: slideX.interpolate({ inputRange: [-DRAWER_W, 0], outputRange: [0, 1] }) }]} />
      </Pressable>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, { width: DRAWER_W, backgroundColor: c.background, borderRightColor: c.border, transform: [{ translateX: slideX }], paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        {/* Header */}
        <View style={styles.drawerHeader}>
          <Text style={[styles.drawerTitle, { color: c.text }]}>Menú</Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={c.text} />
          </Pressable>
        </View>

        {/* Menu items — call action directly, no setTimeout */}
        {menuItems.map((item, i) => (
          <View key={item.label}>
            <DrawerItem item={item} theme={theme} />
            {i < menuItems.length - 1 && <View style={[styles.divider, { backgroundColor: c.border }]} />}
          </View>
        ))}
        <View style={[styles.divider, { backgroundColor: c.border }]} />

        {/* Theme toggle */}
        <DrawerItem
          item={{ icon: theme === "dark" ? "sunny-outline" : "moon-outline", label: theme === "dark" ? "Modo claro" : "Modo oscuro", onPress: toggle }}
          theme={theme}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill },
  drawer: { position: "absolute", top: 0, bottom: 0, left: 0, borderRightWidth: 1 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  drawerTitle: { fontSize: 18, fontWeight: "700" },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  menuLabel: { fontSize: 15, fontWeight: "500" },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});
