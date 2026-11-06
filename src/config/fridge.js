// Configuration centrale de l'app (lue depuis le .env via les variables EXPO_PUBLIC_).
// Tout ce qui est "parametre du projet" vit ici : aucun autre fichier ne lit process.env.

export const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';
const CLOUD_URL = process.env.EXPO_PUBLIC_BROKER_URL || '';
export const CLOUD_USERNAME = process.env.EXPO_PUBLIC_CLOUD_USERNAME || 'app-frigo';
export const CLOUD_PASSWORD = process.env.EXPO_PUBLIC_CLOUD_PASSWORD || '';

// Base des topics = tout ce qui precede /temperature et /status (ex: frigo/1).
export const TOPIC_BASE = process.env.EXPO_PUBLIC_TOPIC_BASE || 'frigo/1';
export const TOPIC_WILDCARD = `${TOPIC_BASE}/#`;
export const TOPIC_TEMPERATURE = `${TOPIC_BASE}/temperature`;
export const TOPIC_STATUS = `${TOPIC_BASE}/status`;

// URL du broker en WebSocket securise (wss), port + chemin inclus.
export const BROKER_URL = USE_CLOUD ? CLOUD_URL : 'wss://broker.hivemq.com:8884/mqtt';

// Plage metier de la chaine du froid.
export const TEMP_MIN = 2;
export const TEMP_MAX = 8;

// Delai avant de confirmer une alerte "hors plage" (anti faux-positif).
// Regle metier = 300 s (5 min). Abaissable via le .env pour tester.
export const ALERT_DELAY_SEC = Number(process.env.EXPO_PUBLIC_ALERT_DELAY_SEC) || 300;
export const ALERT_DELAY_MS = ALERT_DELAY_SEC * 1000;

// Nombre de points conserves pour la courbe (historique glissant).
export const HISTORY_SIZE = 60;
