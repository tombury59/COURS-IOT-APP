import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
// On importe le build pre-package "dist" de mqtt v4 : c'est une version
// deja "browserifiee" qui utilise le WebSocket global (fourni par React Native)
// et n'a PAS besoin des modules Node (stream, buffer...) que la v5 exigerait.
import mqtt from 'mqtt/dist/mqtt';

// --- Configuration (lue depuis le .env via les variables EXPO_PUBLIC_) ---
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';
const CLOUD_URL = process.env.EXPO_PUBLIC_BROKER_URL || '';
const CLOUD_USERNAME = process.env.EXPO_PUBLIC_CLOUD_USERNAME || 'app-frigo';
const CLOUD_PASSWORD = process.env.EXPO_PUBLIC_CLOUD_PASSWORD || '';

// Base des topics = tout ce qui precede /temperature et /status.
// Fournie par le binome (ici "frigo/1").
//   <BASE>/temperature  -> { "temp": 4.2, "hum": 40 }
//   <BASE>/status       -> "online" / "offline" (LWT)
const TOPIC_BASE = process.env.EXPO_PUBLIC_TOPIC_BASE || 'frigo/1';
const TOPIC_WILDCARD = `${TOPIC_BASE}/#`;
const TOPIC_TEMPERATURE = `${TOPIC_BASE}/temperature`;
const TOPIC_STATUS = `${TOPIC_BASE}/status`;

// URL du broker en WebSocket securise (wss), port et chemin inclus.
//   - Cloud  : fournie par le binome, ex EMQX wss://xxx.emqxsl.com:8084/mqtt (avec user/pass)
//   - Public : wss://broker.hivemq.com:8884/mqtt (sans auth)
const BROKER_URL = USE_CLOUD
  ? CLOUD_URL
  : 'wss://broker.hivemq.com:8884/mqtt';

// Plage metier de la chaine du froid.
const TEMP_MIN = 2;
const TEMP_MAX = 8;

export default function App() {
  const clientRef = useRef(null);

  const [brokerStatus, setBrokerStatus] = useState('deconnecte'); // etat du lien app <-> broker
  const [sensorStatus, setSensorStatus] = useState('inconnu'); // online / offline (LWT) / inconnu
  const [temp, setTemp] = useState(null);
  const [hum, setHum] = useState(null);
  const [lastSeen, setLastSeen] = useState(null); // heure de reception de la derniere mesure
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    // Options de connexion MQTT.
    const options = {
      clientId: `app-frigo-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 4000, // tente de se reconnecter automatiquement
    };
    if (USE_CLOUD) {
      options.username = CLOUD_USERNAME;
      options.password = CLOUD_PASSWORD;
    }

    setBrokerStatus('connexion...');
    const client = mqtt.connect(BROKER_URL, options);
    clientRef.current = client;

    client.on('connect', () => {
      setBrokerStatus('connecte');
      setErrorMsg(null);
      // On s'abonne a tout ce qui concerne ce frigo (temperature + status).
      client.subscribe(TOPIC_WILDCARD, { qos: 1 }, (err) => {
        if (err) setErrorMsg(`Echec abonnement : ${err.message}`);
      });
    });

    client.on('reconnect', () => setBrokerStatus('reconnexion...'));
    client.on('close', () => setBrokerStatus('deconnecte'));
    client.on('offline', () => setBrokerStatus('hors ligne'));
    client.on('error', (err) => setErrorMsg(err?.message || String(err)));

    client.on('message', (topic, payload) => {
      const text = payload.toString();
      if (topic === TOPIC_STATUS) {
        // "online" a la connexion (retain) ; "offline" via le LWT si l'ESP32 disparait.
        setSensorStatus(text);
        return;
      }
      if (topic === TOPIC_TEMPERATURE) {
        try {
          const data = JSON.parse(text);
          if (typeof data.temp === 'number') setTemp(data.temp);
          if (typeof data.hum === 'number') setHum(data.hum);
          setLastSeen(new Date());
        } catch (e) {
          setErrorMsg(`Payload temperature illisible : ${text}`);
        }
      }
    });

    // Nettoyage a la fermeture du composant : on ferme proprement la connexion.
    return () => {
      client.end(true);
      clientRef.current = null;
    };
  }, []);

  // Alerte "simple" pour l'instant : vrai des que la temperature sort de la plage.
  // (La regle metier "hors plage > 5 min" sera ajoutee a l'etape 4.)
  const hasTemp = temp !== null;
  const outOfRange = hasTemp && (temp < TEMP_MIN || temp > TEMP_MAX);
  const sensorOffline = sensorStatus === 'offline';
  const alert = outOfRange || sensorOffline;

  return (
    <View style={[styles.container, alert && styles.containerAlert]}>
      <StatusBar style={alert ? 'light' : 'auto'} />

      <Text style={styles.title}>Frigo Pharmacie</Text>
      <Text style={styles.subtitle}>Chaine du froid ({TEMP_MIN}-{TEMP_MAX} C)</Text>

      <View style={styles.card}>
        <Text style={styles.tempValue}>
          {hasTemp ? `${temp.toFixed(1)} C` : '--'}
        </Text>
        <Text style={styles.humValue}>
          Humidite : {hum !== null ? `${hum.toFixed(0)} %` : '--'}
        </Text>
        <Text style={styles.meta}>
          Derniere mesure :{' '}
          {lastSeen ? lastSeen.toLocaleTimeString() : 'aucune pour l instant'}
        </Text>
      </View>

      {alert && (
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>
            {sensorOffline
              ? 'CAPTEUR MUET (statut offline)'
              : `TEMPERATURE HORS PLAGE : ${temp.toFixed(1)} C`}
          </Text>
        </View>
      )}

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Broker</Text>
        <Text style={styles.statusValue}>{brokerStatus}</Text>
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Capteur</Text>
        <Text style={styles.statusValue}>{sensorStatus}</Text>
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Mode</Text>
        <Text style={styles.statusValue}>{USE_CLOUD ? 'EMQX Cloud' : 'broker public'}</Text>
      </View>
      <Text style={styles.topicInfo}>Topic : {TOPIC_WILDCARD}</Text>

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  containerAlert: {
    backgroundColor: '#c0392b', // fond rouge quand il y a une alerte
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 24 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tempValue: { fontSize: 56, fontWeight: '800', color: '#1a1a1a' },
  humValue: { fontSize: 16, color: '#444', marginTop: 4 },
  meta: { fontSize: 13, color: '#888', marginTop: 10 },
  alertBox: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  alertText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '70%',
    paddingVertical: 4,
  },
  statusLabel: { fontSize: 14, color: '#666' },
  statusValue: { fontSize: 14, fontWeight: '600', color: '#222' },
  topicInfo: { fontSize: 12, color: '#999', marginTop: 12 },
  error: { color: '#ffd', backgroundColor: '#8e1b1b', padding: 8, borderRadius: 8, marginTop: 16, fontSize: 12 },
});
