import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Tabs } from './src/components/Tabs';
import { useColdChainAlerts } from './src/hooks/useColdChainAlerts';
import { useFridgeMqtt } from './src/hooks/useFridgeMqtt';
import AlertsScreen from './src/screens/AlertsScreen';
import DashboardScreen from './src/screens/DashboardScreen';

// App.js n'est plus qu'un "chef d'orchestre" :
//  - il branche les deux hooks (donnees MQTT + moteur d'alerte),
//  - il gere l'onglet affiche,
//  - il colore le fond selon l'etat d'alerte.
export default function App() {
  const mqtt = useFridgeMqtt();
  const alerts = useColdChainAlerts({ temp: mqtt.temp, sensorStatus: mqtt.sensorStatus });
  const [view, setView] = useState('dashboard');

  const tabs = [
    { key: 'dashboard', label: 'Tableau de bord' },
    { key: 'alerts', label: `Alertes${alerts.alerts.length ? ` (${alerts.alerts.length})` : ''}` },
  ];

  const containerStyle = [
    styles.container,
    alerts.alertActive && styles.containerAlert,
    !alerts.alertActive && alerts.watching && styles.containerWatch,
  ];

  return (
    <View style={containerStyle}>
      <StatusBar style={alerts.alertActive ? 'light' : 'auto'} />
      <Tabs tabs={tabs} value={view} onChange={setView} />
      {view === 'dashboard' ? (
        <DashboardScreen mqtt={mqtt} alerts={alerts} />
      ) : (
        <AlertsScreen alerts={alerts.alerts} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20 },
  containerAlert: { backgroundColor: '#c0392b' },
  containerWatch: { backgroundColor: '#b9770e' },
});
