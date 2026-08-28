import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, Pressable, View, Animated, PanResponder } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

type Props = {
  isRecording: boolean;
  isLocked?: boolean;
  recordingTime?: number;
  onPressIn: () => void;
  onPressOut: () => void;
  onLock?: () => void;
  onCancel?: () => void;
  onSend?: () => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
  onPress?: () => void; // compatibilidad temporal con Home actual
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RecordButton({
  isRecording,
  isLocked = false,
  recordingTime = 0,
  onPressIn,
  onPressOut,
  onLock,
  onCancel,
  onSend,
  onTogglePause,
  isPaused = false,
  onPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const bottomPad = Math.max(insets.bottom, 8);
  // Botón tarjeta angosto, celeste por tema, justo sobre TabBar con línea separadora
  const bottom = bottomPad + 4;
  const [hovered, setHovered] = useState(false);
  const slideY = useRef(new Animated.Value(0)).current;
  const hasLockedRef = useRef(false);

  // Compat: si se usa onPress (Home actual), mapear a onPressIn/Out simple
  const handlePress = onPress
    ? () => onPress()
    : undefined;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => isRecording,
      onPanResponderMove: (_, gesture) => {
        // Deslizar arriba para bloquear (dy < -60)
        if (isRecording && !isLocked && !hasLockedRef.current && gesture.dy < -60) {
          hasLockedRef.current = true;
          onLock?.();
          Animated.spring(slideY, { toValue: -12, useNativeDriver: true }).start();
        }
        // Deslizar a la izquierda para cancelar (dx < -60) — solo si no está bloqueado
        if (isRecording && !isLocked && gesture.dx < -60) {
          onCancel?.();
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (!isRecording) hasLockedRef.current = false;
  }, [isRecording]);

  const bg = isRecording ? c.destructive : hovered ? c.hover : c.card;
  const borderColor = isRecording ? c.destructive : c.border;

  // Estado bloqueado: muestra barra con Cancelar / Pausar / Enviar — diseño SaveNotes, no WhatsApp morado
  if (isRecording && isLocked) {
    return (
      <View style={[styles.wrapperFull, { bottom, pointerEvents: "box-none" as any }]}>
        <View style={[styles.separatorFull, { backgroundColor: c.border }]} />
        <View style={[styles.lockedBar, { backgroundColor: c.card, borderColor: c.border, boxShadow: `0 2px 8px ${c.shadow}` }]}>
          <Pressable hitSlop={8} style={styles.lockedBtn} onPress={onCancel}>
            <Ionicons name="trash-outline" size={20} color={c.destructive} />
          </Pressable>
          <Pressable
            style={[styles.pauseBtn, { backgroundColor: c.muted, borderColor: c.border }]}
            onPress={onTogglePause}
          >
            <Ionicons name={isPaused ? "play" : "pause"} size={16} color={c.text} />
            <Text style={[styles.pauseText, { color: c.text }]}>{isPaused ? "Reanudar" : "Pausar"}</Text>
          </Pressable>
          <Pressable style={[styles.sendBtn, { backgroundColor: c.primary }]} onPress={onSend}>
            <Ionicons name="send" size={18} color={c.primaryForeground} />
          </Pressable>
        </View>
        <Text style={[styles.timer, { color: c.text }]}>{formatTime(recordingTime)}</Text>
        <Text style={[styles.sub, { color: c.mutedForeground }]}>Desliza para cancelar</Text>
      </View>
    );
  }

  // Estado grabando (hold): tarjeta con timer — SaveNotes, funcionalidad WhatsApp
  if (isRecording && !isLocked) {
    return (
      <View style={[styles.wrapperFull, { bottom, pointerEvents: "box-none" as any }]} {...panResponder.panHandlers}>
        <View style={[styles.separatorFull, { backgroundColor: c.border }]} />
        <Text style={[styles.timer, { color: c.text }]}>{formatTime(recordingTime)}</Text>
        <Pressable
          style={[
            styles.cardBtn,
            {
              backgroundColor: c.destructive,
              borderColor: c.destructive,
              width: "88%",
              maxWidth: 340,
              alignSelf: "center",
              boxShadow: `0 2px 8px ${c.shadow}`,
            },
          ]}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onPress={handlePress}
          delayLongPress={200}
        >
          <Ionicons name="stop" size={24} color={c.primaryForeground} />
          <Text style={[styles.cardText, { color: c.primaryForeground }]}>Grabando — desliza arriba para bloquear</Text>
        </Pressable>
      </View>
    );
  }

  // Idle: tarjeta SaveNotes — celeste por tema, angosta, línea completa, solo texto dentro
  return (
    <View style={[styles.wrapperFull, { bottom, pointerEvents: "box-none" as any }]}>
      <View style={[styles.separatorFull, { backgroundColor: c.border }]} />
      <Pressable
        style={[
          styles.cardBtn,
          {
            backgroundColor: c.primary,
            borderColor: c.primary,
            width: "88%",
            maxWidth: 340,
            alignSelf: "center",
            boxShadow: `0 2px 8px ${c.shadow}`,
          },
          hovered && { backgroundColor: c.secondary },
        ]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={handlePress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        {...panResponder.panHandlers}
      >
        <Ionicons name="mic" size={20} color={c.primaryForeground} />
        <Text style={[styles.cardText, { color: c.primaryForeground }]}>Grabar nueva nota</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    // separación naranja de referencia: evita que cards tapen botón
  },
  wrapperFull: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    // línea completa borde a borde
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    marginBottom: 10,
    opacity: 0.6,
  },
  separatorFull: {
    height: 1,
    width: "100%",
    marginBottom: 12,
    opacity: 1,
  },
  cardBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
  },
  micBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  title: { fontSize: 14, fontWeight: "600", marginTop: 10 },
  sub: { fontSize: 12, marginTop: 2 },
  cardText: { fontSize: 13, fontWeight: "600" },
  timer: { fontSize: 14, fontWeight: "700", marginBottom: 8, fontVariant: ["tabular-nums"] as any },
  lockedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 3,
  },
  lockedBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pauseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pauseText: { fontSize: 13, fontWeight: "600" },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
