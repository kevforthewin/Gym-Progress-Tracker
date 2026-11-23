import { describe, expect, it } from 'vitest';
import { durationMinutes, HealthExportAggregator, healthDate, healthNumber, parseShortcutText } from './health';

describe('Hilfen', () => {
  it('Datum', () => {
    expect(healthDate('2026-11-22 08:00:00 +0100')).toBe('2026-11-22');
    expect(healthDate('22.11.2026, 08:00')).toBe('2026-11-22');
    expect(healthDate('5.1.26')).toBe('2026-01-05');
  });
  it('Zahlen (deutsches Format)', () => {
    expect(healthNumber('8.543', true)).toBe(8543);
    expect(healthNumber('8543 Schritte', true)).toBe(8543);
    expect(healthNumber('45,2')).toBe(45.2);
    expect(healthNumber('45.2')).toBe(45.2);
    expect(healthNumber('1.234,5')).toBe(1234.5);
  });
  it('Dauer', () => {
    expect(durationMinutes('30')).toBe(30);
    expect(durationMinutes('1800')).toBe(30);
    expect(durationMinutes('0:45:00')).toBe(45);
    expect(durationMinutes('1 h')).toBe(60);
  });
});

describe('Kurzbefehl-Text', () => {
  it('liest Tageswerte, Gewicht und Workouts', () => {
    const r = parseShortcutText(`steps;2026-11-22;8.543
steps;2026-11-22;1.000
kcal;2026-11-22;612
vo2;2026-11-22;45,2
rhr;22.11.2026;54
weight;2026-11-22;82,4
workout;2026-11-22;Laufband;30;4,2;310
Unsinn
`);
    expect(r.days['2026-11-22']).toEqual({ steps: 9543, activeKcal: 612, vo2max: 45.2, restingHr: 54 });
    expect(r.weights['2026-11-22']).toBe(82.4);
    expect(r.workouts).toEqual([{ externalId: 'sc|2026-11-22|Laufband|30', date: '2026-11-22', kind: 'Laufband', durationMin: 30, distanceKm: 4.2, kcal: 310 }]);
  });
});

describe('Health-Export', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="de_DE">
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-11-22 08:00:00 +0100" endDate="2026-11-22 08:10:00 +0100" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-11-22 12:00:00 +0100" endDate="2026-11-22 12:10:00 +0100" value="2000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-11-22 08:00:00 +0100" endDate="2026-11-22 08:10:00 +0100" value="5600"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="kJ" startDate="2026-11-22 08:00:00 +0100" endDate="2026-11-22 09:00:00 +0100" value="418.4"/>
 <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Apple Watch" unit="mL/min·kg" startDate="2026-11-22 18:00:00 +0100" endDate="2026-11-22 18:00:00 +0100" value="44.8"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-11-22 23:00:00 +0100" endDate="2026-11-22 23:00:00 +0100" value="55"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Waage" unit="lb" startDate="2026-11-22 07:00:00 +0100" endDate="2026-11-22 07:00:00 +0100" value="180"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2025-01-01 08:00:00 +0100" endDate="2025-01-01 08:10:00 +0100" value="100"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30.5" durationUnit="min" sourceName="Apple Watch" startDate="2026-11-22 18:00:00 +0100" endDate="2026-11-22 18:30:30 +0100">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="x" endDate="y" sum="312.4" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="x" endDate="y" sum="4.21" unit="km"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="70" durationUnit="min" startDate="2026-11-21 18:00:00 +0100" endDate="2026-11-21 19:10:00 +0100">
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="1800" durationUnit="s" totalDistance="10" totalDistanceUnit="mi" totalEnergyBurned="200" totalEnergyBurnedUnit="kcal" startDate="2026-11-20 18:00:00 +0100" endDate="2026-11-20 18:30:00 +0100"/>
</HealthData>`;

  it('aggregiert Tage (max über Quellen), Einheiten, Workouts; Stücke beliebig getrennt', () => {
    const agg = new HealthExportAggregator('2026-01-01');
    for (let i = 0; i < xml.length; i += 37) agg.push(xml.slice(i, i + 37));
    const r = agg.result();
    expect(r.days['2026-11-22']).toEqual({ steps: 5600, activeKcal: 100, vo2max: 44.8, restingHr: 55 });
    expect(r.days['2025-01-01']).toBeUndefined();
    expect(r.weights['2026-11-22']).toBeCloseTo(81.65, 2);
    expect(r.workouts).toEqual([
      { externalId: 'hk|2026-11-22 18:00:00 +0100|Running', date: '2026-11-22', kind: 'Laufband', durationMin: 30.5, distanceKm: 4.21, kcal: 312 },
      { externalId: 'hk|2026-11-20 18:00:00 +0100|Cycling', date: '2026-11-20', kind: 'Radfahren', durationMin: 30, distanceKm: 16.09, kcal: 200 },
    ]);
  });
});
