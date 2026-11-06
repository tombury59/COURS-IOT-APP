import { useEffect, useRef, useState } from 'react';
import { ALERT_DELAY_MS, ALERT_DELAY_SEC, TEMP_MAX, TEMP_MIN } from '../config/fridge';
import { fmtDuration } from '../utils/time';

// Hook : le "moteur d'alerte" de la chaine du froid.
// Entrees : la temperature et le statut capteur (venant de useFridgeMqtt).
// Sorties : l'etat d'alerte derive + le journal horodate.
//
// Regles :
//  - une temperature hors plage ne declenche PAS l'alerte tout de suite :
//    on attend ALERT_DELAY_SEC en continu (anti ouverture de porte).
//  - un statut "offline" (LWT) = alerte "capteur muet" immediate.
export function useColdChainAlerts({ temp, sensorStatus }) {
  const [tempAlertActive, setTempAlertActive] = useState(false); // hors plage CONFIRMEE
  const [outOfRangeSince, setOutOfRangeSince] = useState(null);
  const [alerts, setAlerts] = useState([]); // journal (plus recent en tete)
  const [now, setNow] = useState(Date.now()); // horloge pour le compte a rebours

  // Refs pour que le setInterval (cree une seule fois) lise toujours les
  // dernieres valeurs, sans etre piege par une closure obsolete.
  const latest = useRef({ temp: null, sensorStatus: 'inconnu' });
  latest.current = { temp, sensorStatus };
  const outOfRangeSinceRef = useRef(null);
  const tempAlertActiveRef = useRef(false);
  const prevSensorRef = useRef('inconnu');

  function pushAlert(level, message) {
    setAlerts((prev) =>
      [{ id: `${Date.now()}-${Math.random()}`, level, message, at: new Date() }, ...prev].slice(0, 50)
    );
  }

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      const { temp: t, sensorStatus: s } = latest.current;

      // 1) Capteur muet (LWT) : journaliser les transitions.
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

      if (outOfRangeSinceRef.current === null) {
        outOfRangeSinceRef.current = Date.now();
        setOutOfRangeSince(outOfRangeSinceRef.current);
      }
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
  const watching = hasTemp && !inRangeNow && !tempAlertActive && outOfRangeSince !== null;
  const elapsedSec = outOfRangeSince ? (now - outOfRangeSince) / 1000 : 0;
  const remainingSec = Math.max(0, ALERT_DELAY_SEC - elapsedSec);

  return { alerts, tempAlertActive, alertActive, sensorOffline, watching, elapsedSec, remainingSec };
}
