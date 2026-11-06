import { StyleSheet, Text, View } from 'react-native';

// Banniere de notification dans l'app. level : 'danger' | 'watch'.
export function Banner({ level = 'danger', children }) {
  return (
    <View style={[styles.banner, level === 'watch' ? styles.watch : styles.danger]}>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, padding: 14, marginBottom: 16 },
  danger: { backgroundColor: 'rgba(0,0,0,0.25)' },
  watch: { backgroundColor: 'rgba(0,0,0,0.2)' },
  text: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
