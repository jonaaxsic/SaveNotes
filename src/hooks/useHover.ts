import { useState, useCallback } from "react";

export function useHover() {
  const [hovered, setHovered] = useState(false);
  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => setHovered(false), []);
  return { hovered, onMouseEnter, onMouseLeave };
}
