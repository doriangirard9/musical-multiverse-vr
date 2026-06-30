// Vide par défaut = MÊME ORIGINE : tous les appels backend sont de la forme
// `${SERVER_NAME}/api/...`, et le proxy Vite route `/api` → :3000 (pas de CORS,
// un seul tunnel adb pour le Quest). main converge sur le même choix. Un
// déploiement avec backend séparé peut définir VITE_SERVER_NAME.
export const SERVER_NAME = import.meta.env.VITE_SERVER_NAME
    ?? '';

export const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER
    ?? `https://wamjamparty.i3s.univ-cotedazur.fr/rtc`;
