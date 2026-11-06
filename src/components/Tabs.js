import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Barre d'onglets generique.
// - tabs   : [{ key, label }]
// - value  : cle de l'onglet actif
// - onChange(key)
export function Tabs({ tabs, value, onChange }) {
  return (
    <View style={styles.tabs}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(t.key)}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', marginBottom: 16, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#ffffff' },
  tabText: { fontSize: 14, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#111' },
});
