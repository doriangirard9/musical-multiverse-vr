
// Vide par défaut = MÊME ORIGINE : tous les appels backend sont de la forme
// `${SERVER_NAME}/api/...`, et le proxy Vite route `/api` → :3000.
// Avantages : aucun CORS (l'ancien défaut http://localhost:3000 était bloqué
// dès que le front ne tournait pas sur le port attendu par le serveur — ici
// 5179, le serveur n'autorisait que 5173), et un seul tunnel adb (5179)
// suffit pour tester sur le Quest. Un déploiement avec backend séparé peut
// toujours définir VITE_SERVER_NAME.
export const SERVER_NAME = import.meta.env.VITE_SERVER_NAME
    ?? '';

export const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER
    ?? `https://wamjamparty.i3s.univ-cotedazur.fr/rtc`;
