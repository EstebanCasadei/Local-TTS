// Ícono de cada voz: imagen estática servida desde public/voices/<id>.png.
// Para cambiar el ícono de una voz, basta con reemplazar ese archivo (mismo
// nombre = mismo id de voz). Si no existe, se usa public/voices/default.png.
export const DEFAULT_VOICE_ICON = "/voices/default.png";

export function voiceIconSrc(voiceId: string): string {
  return `/voices/${voiceId}.png`;
}
