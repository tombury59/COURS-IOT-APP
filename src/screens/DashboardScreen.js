import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner } from '../components/Banner';
import { StatusRow } from '../components/StatusRow';
import TemperatureChart from '../components/TemperatureChart';
import { ALERT_DELAY_SEC, TEMP_MAX, TEMP_MIN, TOPIC_WILDCARD, USE_CLOUD } from '../config/fridge';
import { fmtDuration } from '../utils/time';

// Ecran "tableau de bord" : purement presentatif, il recoit l'etat en props.
export default function DashboardScreen({ mqtt, alerts }) {
  const { brokerStatus, sensorStatus, temp, hum, lastSeen, errorMsg, history } = mqtt;
  const { alertActive, sensorOffline, watching, elapsedSec, remainingSec } = alerts;
  const hasTemp = temp !== null;

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Frigo Pharmacie</Text>
      <Text style={styles.subtitle}>Chaine du froid ({TEMP_MIN}-{TEMP_MAX} C)</Text>

      <View style={styles.card}>
        <Text style={styles.tempValue}>{hasTemp ? `${temp.toFixed(1)} C` : '--'}</Text>
        <Text style={styles.humValue}>Humidite : {hum !== null ? `${hum.toFixed(0)} %` : '--'}</Text>
        <Text style={styles.meta}>
          Derniere mesure : {lastSeen ? lastSeen.toLocaleTimeString() : 'aucune pour l instant'}
        </Text>
      </View>

      {/* Courbe de temperature en direct (bande 2-8 C en fond) */}
      <TemperatureChart points={history} min={TEMP_MIN} max={TEMP_MAX} />

      {/* Bannieres de notification */}
      {alertActive && (
        <Banner level="danger">
          {sensorOffline
            ? 'ALERTE : capteur muet (statut offline)'
            : `ALERTE : temperature hors plage (${temp.toFixed(1)} C)`}
        </Banner>
      )}
      {!alertActive && watching && (
        <Banner level="watch">
          {`Surveillance : hors plage depuis ${fmtDuration(elapsedSec)} — alerte dans ${fmtDuration(remainingSec)}`}
        </Banner>
      )}

      <StatusRow label="Broker" value={brokerStatus} />
      <StatusRow label="Capteur" value={sensorStatus} />
      <StatusRow label="Mode" value={USE_CLOUD ? 'EMQX Cloud' : 'broker public'} />
      <StatusRow label="Delai alerte" value={fmtDuration(ALERT_DELAY_SEC)} />
      <Text style={styles.topicInfo}>Topic : {TOPIC_WILDCARD}</Text>

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: { paddingBottom: 24 },
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
  topicInfo: { fontSize: 12, color: '#999', marginTop: 10 },
  error: { color: '#ffd', backgroundColor: '#8e1b1b', padding: 8, borderRadius: 8, marginTop: 14, fontSize: 12 },
});
