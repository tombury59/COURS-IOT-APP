import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

// Courbe de temperature "maison" dessinee en SVG.
// - points : tableau de { value, at } (du plus ancien au plus recent)
// - min/max : bornes de la plage metier, affichees en bande de fond
//
// Principe : on projette chaque valeur sur des coordonnees pixel.
//   x = position horizontale selon l'index du point
//   y = position verticale selon la valeur (inversee : en SVG, y augmente vers le bas)
export default function TemperatureChart({ points = [], min, max, height = 200 }) {
  const [w, setW] = useState(0);

  // Marges internes pour laisser la place aux etiquettes.
  const padL = 36;
  const padR = 14;
  const padT = 12;
  const padB = 22;

  const values = points.map((p) => p.value);
  const n = values.length;

  // Domaine vertical : on englobe les donnees ET la plage metier, avec 1 C de marge.
  const dataMin = n ? Math.min(...values) : min;
  const dataMax = n ? Math.max(...values) : max;
  let yMin = Math.min(dataMin, min) - 1;
  let yMax = Math.max(dataMax, max) + 1;
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const innerW = Math.max(0, w - padL - padR);
  const innerH = height - padT - padB;

  const xOf = (i) => padL + (n <= 1 ? innerW : (i / (n - 1)) * innerW);
  const yOf = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const polyline = points.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(' ');
  const last = points[n - 1];
  const lastInRange = last && last.value >= min && last.value <= max;

  return (
    <View style={styles.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {/* Bande de la plage metier 2-8 C */}
          <Rect x={padL} y={yOf(max)} width={innerW} height={yOf(min) - yOf(max)} fill="#2d8a4e" opacity={0.15} />
          {/* Lignes des bornes min / max */}
          <Line x1={padL} y1={yOf(max)} x2={padL + innerW} y2={yOf(max)} stroke="#2d8a4e" strokeWidth={1} strokeDasharray="4 4" />
          <Line x1={padL} y1={yOf(min)} x2={padL + innerW} y2={yOf(min)} stroke="#2d8a4e" strokeWidth={1} strokeDasharray="4 4" />
          {/* Etiquettes verticales */}
          <SvgText x={4} y={yOf(max) + 4} fontSize={10} fill="#2d8a4e">{`${max}`}</SvgText>
          <SvgText x={4} y={yOf(min) + 4} fontSize={10} fill="#2d8a4e">{`${min}`}</SvgText>
          <SvgText x={4} y={padT + 8} fontSize={10} fill="#999">{`${yMax.toFixed(0)}`}</SvgText>
          <SvgText x={4} y={padT + innerH} fontSize={10} fill="#999">{`${yMin.toFixed(0)}`}</SvgText>
          {/* Courbe */}
          {n >= 2 && (
            <Polyline
              points={polyline}
              fill="none"
              stroke={lastInRange ? '#1f6feb' : '#c0392b'}
              strokeWidth={2.5}
            />
          )}
          {/* Point courant */}
          {last && (
            <Circle cx={xOf(n - 1)} cy={yOf(last.value)} r={4} fill={lastInRange ? '#1f6feb' : '#c0392b'} />
          )}
        </Svg>
      )}
      {n === 0 && <Text style={styles.empty}>En attente de mesures...</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 8,
    marginBottom: 16,
    minHeight: 120,
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', color: '#999', fontSize: 13, paddingVertical: 40 },
});
