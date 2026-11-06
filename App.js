import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
// On importe le build pre-package "dist" de mqtt v4 : version deja "browserifiee"
// qui utilise le WebSocket global (fourni par React Native) et n'a PAS besoin
// des modules Node (stream, buffer...) que la v5 exigerait.
import mqtt from 'mqtt/dist/mqtt';

// --- Configuration (lue depuis le .env via les variables EXPO_PUBLIC_) ---
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';
const CLOUD_URL = process.env.EXPO_PUBLIC_BROKER_URL || '';
const CLOUD_USERNAME = process.env.EXPO_PUBLIC_CLOUD_USERNAME || 'app-frigo';
const CLOUD_PASSWORD = process.env.EXPO_PUBLIC_CLOUD_PASSWORD || '';

// Base des topics = tout ce qui precede /temperature et /status.
const TOPIC_BASE = process.env.EXPO_PUBLIC_TOPIC_BASE || 'frigo/1';
const TOPIC_WILDCARD = `${TOPIC_BASE}/#`;
const TOPIC_TEMPERATURE = `${TOPIC_BASE}/temperature`;
const TOPIC_STATUS = `${TOPIC_BASE}/status`;

const BROKER_URL = USE_CLOUD ? CLOUD_URL : 'wss://broker.hivemq.com:8884/mqtt';

// Plage metier de la chaine du froid.
const TEMP_MIN = 2;
const TEMP_MAX = 8;

// Delai avant de confirmer une alerte "hors plage" (anti faux-positif :
// ouverture de porte, coup de chaud passager). 300 s = la regle metier des 5 min.
// Abaisse-le (ex 30) dans le .env pour tester/demontrer sans attendre.
const ALERT_DELAY_SEC = Number(process.env.EXPO_PUBLIC_ALERT_DELAY_SEC) || 300;
const ALERT_DELAY_MS = ALERT_DELAY_SEC * 1000;

function fmtDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m} min${r ? ` ${r}s` : ''}`;
  return `${r}s`;
}

export default function App() {
  const clientRef = useRef(null);

  // Etat "brut" alimente directement par MQTT.
  const [brokerStatus, setBrokerStatus] = useState('deconnecte');
  const [sensorStatus, setSensorStatus] = useState('inconnu'); // online / offline (LWT) / inconnu
  const [temp, setTemp] = useState(null);
  const [hum, setHum] = useState(null);
  const [lastSeen, setLastSeen] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Etat derive du "moteur d'alerte".
  const [tempAlertActive, setTempAlertActive] = useState(false); // alerte hors plage CONFIRMEE
  const [outOfRangeSince, setOutOfRangeSince] = useState(null); // debut de la periode hors plage
  const [alerts, setAlerts] = useState([]); // journal des alertes (plus recentes en tete)
  const [now, setNow] = useState(Date.now()); // horloge pour le compte a rebours
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'alerts'

  // On garde les dernieres valeurs dans une ref pour que le "moteur" (un
  // setInterval cree une seule fois) lise toujours l'etat a jour, sans etre
  // piege par une closure obsolete.
  const latest = useRef({ temp: null, sensorStatus: 'inconnu' });
  latest.current = { temp, sensorStatus };

  // Refs de decision du moteur (valeurs non destinees a l'affichage direct).
  const outOfRangeSinceRef = useRef(null);
  const tempAlertActiveRef = useRef(false);
  const prevSensorRef = useRef('inconnu');

  function pushAlert(level, message) {
    setAlerts((prev) =>
      [{ id: `${Date.now()}-${Math.random()}`, level, message, at: new Date() }, ...prev].slice(0, 50)
    );
  }

  // --- Connexion MQTT (une seule fois) ---
  useEffect(() => {
    const options = {
      clientId: `app-frigo-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 4000,
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
        setSensorStatus(text); // "online" (retain) / "offline" (LWT)
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

    return () => {
      client.end(true);
      clientRef.current = null;
    };
  }, []);

  // --- Moteur d'alerte : tourne chaque seconde, lit `latest.current` ---
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const { temp: t, sensorStatus: s } = latest.current;

      // 1) Capteur muet (LWT) : on journalise les transitions online/offline.
      if (s !== prevSensorRef.current) {
        if (s === 'offline') pushAlert('danger', 'Capteur muet (statut offline)');
        else if (s === 'online' && prevSensorRef.current === 'offline')
          pushAlert('info', 'Capteur retabli (online)');
        prevSensorRef.current = s;
      }

      // 2) Temperature hors plage AVEC temporisation.
      if (t === null) return;
      const inRange = t >= TEMP_MIN && t <= TEMP_MAX;

      if (inRange) {
        if (outOfRangeSinceRef.current !== null) {
          outOfRangeSinceRef.current = null;
          setOutOfRangeSince(null);
        }
        if (tempAlertActiveRef.current) {
          tempAlertActiveRef.current = false;
          setTempAlertActive(false);
          pushAlert('info', `Retour en plage (${t.toFixed(1)} C)`);
        }
        return;
      }

      // Hors plage : on demarre le chrono si ce n'est pas deja fait...
      if (outOfRangeSinceRef.current === null) {
        outOfRangeSinceRef.current = Date.now();
        setOutOfRangeSince(outOfRangeSinceRef.current);
      }
      // ... et on confirme l'alerte seulement au-dela du delai.
      if (!tempAlertActiveRef.current && Date.now() - outOfRangeSinceRef.current >= ALERT_DELAY_MS) {
        tempAlertActiveRef.current = true;
        setTempAlertActive(true);
        pushAlert('danger', `Temperature hors plage > ${fmtDuration(ALERT_DELAY_SEC)} (${t.toFixed(1)} C)`);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // --- Valeurs derivees pour l'affichage ---
  const hasTemp = temp !== null;
  const inRangeNow = hasTemp && temp >= TEMP_MIN && temp <= TEMP_MAX;
  const sensorOffline = sensorStatus === 'offline';
  const alertActive = tempAlertActive || sensorOffline;
  // Phase "surveillance" : hors plage mais alerte pas encore confirmee.
  const watching = hasTemp && !inRangeNow && !tempAlertActive && outOfRangeSince !== null;
  const elapsedSec = outOfRangeSince ? (now - outOfRangeSince) / 1000 : 0;
  const remainingSec = Math.max(0, ALERT_DELAY_SEC - elapsedSec);

  const containerStyle = [
    styles.container,
    alertActive && styles.containerAlert,
    !alertActive && watching && styles.containerWatch,
  ];

  return (
    <View style={containerStyle}>
      <StatusBar style={alertActive ? 'light' : 'auto'} />

      {/* Onglets */}
      <View style={styles.tabs}>
        <Tab label="Tableau de bord" active={view === 'dashboard'} onPress={() => setView('dashboard')} />
        <Tab
          label={`Alertes${alerts.length ? ` (${alerts.length})` : ''}`}
          active={view === 'alerts'}
          onPress={() => setView('alerts')}
        />
      </View>

      {view === 'dashboard' ? (
        <View style={styles.flex1}>
          <Text style={styles.title}>Frigo Pharmacie</Text>
          <Text style={styles.subtitle}>Chaine du froid ({TEMP_MIN}-{TEMP_MAX} C)</Text>

          <View style={styles.card}>
            <Text style={styles.tempValue}>{hasTemp ? `${temp.toFixed(1)} C` : '--'}</Text>
            <Text style={styles.humValue}>
              Humidite : {hum !== null ? `${hum.toFixed(0)} %` : '--'}
            </Text>
            <Text style={styles.meta}>
              Derniere mesure : {lastSeen ? lastSeen.toLocaleTimeString() : 'aucune pour l instant'}
            </Text>
          </View>

          {/* Bannieres de notification */}
          {alertActive && (
            <View style={styles.bannerDanger}>
              <Text style={styles.bannerText}>
                {sensorOffline
                  ? 'ALERTE : capteur muet (statut offline)'
                  : `ALERTE : temperature hors plage (${temp.toFixed(1)} C)`}
              </Text>
            </View>
          )}
          {!alertActive && watching && (
            <View style={styles.bannerWatch}>
              <Text style={styles.bannerText}>
                Surveillance : hors plage depuis {fmtDuration(elapsedSec)} — alerte dans{' '}
                {fmtDuration(remainingSec)}
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
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Delai alerte</Text>
            <Text style={styles.statusValue}>{fmtDuration(ALERT_DELAY_SEC)}</Text>
          </View>
          <Text style={styles.topicInfo}>Topic : {TOPIC_WILDCARD}</Text>

          {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
        </View>
      ) : (
        <AlertsView alerts={alerts} />
      )}
    </View>
  );
}

function Tab({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AlertsView({ alerts }) {
  return (
    <View style={styles.flex1}>
      <Text style={styles.title}>Alertes</Text>
      <Text style={styles.subtitle}>Historique (session en cours)</Text>
      {alerts.length === 0 ? (
        <Text style={styles.emptyText}>Aucune alerte pour l instant.</Text>
      ) : (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.alertsList}>
          {alerts.map((a) => (
            <View key={a.id} style={styles.alertItem}>
              <View style={[styles.dot, a.level === 'danger' ? styles.dotDanger : styles.dotInfo]} />
              <View style={styles.flex1}>
                <Text style={styles.alertMessage}>{a.message}</Text>
                <Text style={styles.alertTime}>{a.at.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20 },
  containerAlert: { backgroundColor: '#c0392b' },
  containerWatch: { backgroundColor: '#b9770e' },
  flex1: { flex: 1 },
  tabs: { flexDirection: 'row', marginBottom: 16, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#ffffff' },
  tabText: { fontSize: 14, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#111' },
  title: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  card: {
    backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 28, paddingHorizontal: 40,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  tempValue: { fontSize: 56, fontWeight: '800', color: '#1a1a1a' },
  humValue: { fontSize: 16, color: '#444', marginTop: 4 },
  meta: { fontSize: 13, color: '#888', marginTop: 10 },
  bannerDanger: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 14, marginBottom: 16 },
  bannerWatch: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 14, marginBottom: 16 },
  bannerText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  statusLabel: { fontSize: 14, color: '#666' },
  statusValue: { fontSize: 14, fontWeight: '600', color: '#222' },
  topicInfo: { fontSize: 12, color: '#999', marginTop: 10 },
  error: { color: '#ffd', backgroundColor: '#8e1b1b', padding: 8, borderRadius: 8, marginTop: 14, fontSize: 12 },
  emptyText: { fontSize: 14, color: '#777', marginTop: 20 },
  alertsList: { paddingBottom: 20 },
  alertItem: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 12 },
  dotDanger: { backgroundColor: '#c0392b' },
  dotInfo: { backgroundColor: '#2d8a4e' },
  alertMessage: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  alertTime: { fontSize: 12, color: '#888', marginTop: 2 },
});
