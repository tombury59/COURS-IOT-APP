import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Ecran "journal des alertes".
export default function AlertsScreen({ alerts }) {
  return (
    <View style={styles.flex1}>
      <Text style={styles.title}>Alertes</Text>
      <Text style={styles.subtitle}>Historique (session en cours)</Text>
      {alerts.length === 0 ? (
        <Text style={styles.empty}>Aucune alerte pour l instant.</Text>
      ) : (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.list}>
          {alerts.map((a) => (
            <View key={a.id} style={styles.item}>
              <View style={[styles.dot, a.level === 'danger' ? styles.dotDanger : styles.dotInfo]} />
              <View style={styles.flex1}>
                <Text style={styles.message}>{a.message}</Text>
                <Text style={styles.time}>{a.at.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  empty: { fontSize: 14, color: '#777', marginTop: 20 },
  list: { paddingBottom: 20 },
  item: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 12 },
  dotDanger: { backgroundColor: '#c0392b' },
  dotInfo: { backgroundColor: '#2d8a4e' },
  message: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  time: { fontSize: 12, color: '#888', marginTop: 2 },
});
