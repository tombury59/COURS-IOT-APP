import { useEffect, useRef, useState } from 'react';
// Build "dist" de mqtt v4 : utilise le WebSocket global de React Native,
// sans les modules Node (stream, buffer...) qu'exigerait la v5.
import mqtt from 'mqtt/dist/mqtt';
import {
  BROKER_URL,
  CLOUD_PASSWORD,
  CLOUD_USERNAME,
  HISTORY_SIZE,
  TOPIC_STATUS,
  TOPIC_TEMPERATURE,
  TOPIC_WILDCARD,
  USE_CLOUD,
} from '../config/fridge';

// Hook : encapsule TOUTE la logique MQTT et expose l'etat "brut" du frigo.
// (L'equivalent d'un composable Vue : de la logique reactive reutilisable.)
export function useFridgeMqtt() {
  const [brokerStatus, setBrokerStatus] = useState('deconnecte'); // lien app <-> broker
  const [sensorStatus, setSensorStatus] = useState('inconnu'); // online / offline (LWT)
  const [temp, setTemp] = useState(null);
  const [hum, setHum] = useState(null);
  const [lastSeen, setLastSeen] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [history, setHistory] = useState([]); // points { value, at } pour la courbe
  const clientRef = useRef(null);

  useEffect(() => {
    const options = {
      clientId: `app-frigo-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 4000, // reconnexion automatique
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
          if (typeof data.temp === 'number') {
            setTemp(data.temp);
            setHistory((prev) => [...prev, { value: data.temp, at: new Date() }].slice(-HISTORY_SIZE));
          }
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

  return { brokerStatus, sensorStatus, temp, hum, lastSeen, errorMsg, history };
}
