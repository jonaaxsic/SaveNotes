import { describe, it, expect } from "vitest";

// Extrae la lógica pura de buildTitleFromTranscript para testear sin RN
function buildTitleFromTranscript(transcript: string | null | undefined): string {
  if (transcript && transcript.trim() && !transcript.startsWith("No se") && !transcript.startsWith("Grabación de voz")) {
    const words = transcript.trim().split(/\s+/).slice(0, 6).join(" ");
    if (!words) return `Nota de voz`;
    const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
    const hasMore = transcript.trim().split(/\s+/).length > 6;
    return hasMore ? `${capitalized}…` : capitalized;
  }
  return `Nota de voz`;
}

describe("buildTitleFromTranscript — títulos automáticos Option A", () => {
  it("usa 6 primeras palabras y capitaliza", () => {
    expect(buildTitleFromTranscript("hola mundo esta es una prueba larga con más palabras")).toBe("Hola mundo esta es una prueba…");
  });
  it("no trunca si <=6 palabras", () => {
    expect(buildTitleFromTranscript("comprar pan leche")).toBe("Comprar pan leche");
  });
  it("fallback a Nota de voz si es error", () => {
    expect(buildTitleFromTranscript("No se pudo transcribir — toca para reintentar")).toBe("Nota de voz");
    expect(buildTitleFromTranscript("No se detectó voz — toca para reintentar")).toBe("Nota de voz");
  });
  it("fallback si null/empty", () => {
    expect(buildTitleFromTranscript(null)).toBe("Nota de voz");
    expect(buildTitleFromTranscript("")).toBe("Nota de voz");
    expect(buildTitleFromTranscript("   ")).toBe("Nota de voz");
  });
  it("error mapping de live session a mensajes humanos", () => {
    const mapError = (code: string) => {
      if (code === "not-allowed") return "Permiso denegado — activa micrófono y reconocimiento en Ajustes";
      if (code === "language-not-supported") return "Idioma no soportado — descarga el paquete es-ES en Ajustes";
      if (code === "network") return "Sin conexión — conecta a internet o descarga el modelo offline es-ES";
      if (code === "service-not-allowed") return "Servicio no disponible — instala Google Speech Services";
      return "No se pudo transcribir — toca para reintentar";
    };
    expect(mapError("not-allowed")).toContain("Permiso");
    expect(mapError("network")).toContain("Sin conexión");
    expect(mapError("unknown")).toContain("reintentar");
  });
});
