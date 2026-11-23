# Gym Progress Tracker

Persönliche, offline-fähige Web-App (PWA) zum Tracken des Trainings – getrennt nach **Gym** und **Gerät**,
mit automatischem **Ziel für das nächste Training** (doppelte Progression) und **Fortschritts-Charts**.

## Features
- **Gyms, Übungen, Geräte**: Übungen sind global („Brustpresse“), Geräte gehören zu einem Gym und haben einen
  eigenen Gewichtssprung, Startgewicht und Einstellungsnotiz (Sitzhöhe …). Historie wird **strikt je Gerät/Gym** geführt.
- **Pläne/Splits** (z. B. Push/Pull/Legs) sind global. Beim Start wählst du das Gym, jede Übung wird automatisch
  auf das dortige Gerät gemappt; fehlende Geräte werden mit einem Tipp angelegt. Der nächste Trainingstag rotiert automatisch.
- **Übungstypen**: Gewicht × Wdh., Körpergewicht (+ Zusatzgewicht), Zeit/Distanz.
- **Ziel-Berechnung** (`src/domain/progression.ts`):
  - Alle Sätze am oberen Ende des Wdh.-Bereichs → Gewicht + Geräte-Inkrement, zurück aufs untere Ende.
  - Sonst gleiches Gewicht, +1 Wdh. je Satz.
  - 3 Sessions ohne Verbesserung → Deload ≈ −10 %.
  - Zeit/Distanz: +5 %. Aufwärmsätze zählen nie.
- **Fortschritt**: e1RM, Top-Gewicht, Volumen, Max-Wdh., Distanz/Dauer als Verlauf, Bestwerte, Session-Tabelle.
- **Backup**: JSON-Export/Wiederherstellen (Daten liegen nur lokal in IndexedDB), Erinnerung nach 14 Tagen.
- **Schnelleingabe**: Training als Text („Bankdrücken 70 a 8/8/7“, „Links 54 a 8/8/8“, „6,8 a 10/10/10 pro Seite“, „7/7/6“) eintragen, Namen werden zugeordnet und gemerkt.
- **Wertung pro Satz/Übung**: „unsauber“, „Ersatz“, „zählt nicht“ → bleibt in der Historie, zählt nicht fürs Ziel/Charts/Bestwerte.
- **Gewichtsstufen pro Gerät** (z. B. Matrix 29,8 · 32 · 34,3 …) – Ziel und +/− springen auf echte Werte; „Aus Historie übernehmen“.
- **Alternativen & Tauschen**: Übungen mit gleicher Alternativ-Gruppe im Training per ⋯ tauschen (z. B. Face Pull ⇄ Reverse Butterfly).
- **Links/rechts in einer Karte** mit Seitenvergleich (schwächere Seite zuerst, Hinweis ab 5 % / Status ab 10 % Unterschied).
- **Status** auf der Startseite: Steigern, Bestwerte (7 Tage), Stagniert, Deload, Wochenbilanz.
- **Wochen-Volumen**: Arbeitssätze pro Muskelgruppe und Woche (Orientierung 10–20).
- **Körpergewicht & Cardio**: Verlauf, Minuten pro Woche.
- **Apple Health** (Fortschritt → Körper & Cardio): Schritte, aktive kcal, VO₂max, Ruhepuls, Gewicht und Cardio-Workouts.
  - laufend per iOS-Kurzbefehl → Zwischenablage → „📋 Einlesen“ (Zeilen wie `steps;2026-11-22;8543`, Anleitung in der App)
  - Vergangenheit per Health-Export (`Export.zip`), wird im Web-Worker gestreamt; Schritte je Tag = Maximum über Quellen
    (iPhone/Watch nicht doppelt), Krafttraining-Workouts werden nicht als Cardio übernommen, Workouts nie doppelt.
  - Web-Apps haben keinen direkten HealthKit-Zugriff – dafür bräuchte es eine native iOS-App.
- **Trainings hinzufügen**: Trainings aus einer JSON-Datei anhängen, ohne Daten zu löschen (siehe unten).

## Trainings per Datei hinzufügen
*Mehr → Trainings hinzufügen* hängt Trainings an, ohne etwas zu löschen (anders als *Backup wiederherstellen*,
das alle Daten ersetzt). Gyms und Übungen werden über den Namen zugeordnet; unbekannte Namen ordnest du einmal zu,
die Zuordnung wird gemerkt. Doppelte Trainings (gleiches Gym, Tag und Trainingstag) werden erkannt.

```json
{
  "sessions": [
    {
      "date": "2026-11-22",
      "gym": "Iron & Soul",
      "workout_type": "Push",
      "exercises": [
        { "exercise": "Bankdrücken", "sets": [{ "weight_kg": 70, "reps": 8 }, { "weight_kg": 70, "reps": 7 }] },
        { "exercise": "Kabel-Seitheben", "sets": [{ "weight_kg": 7.9, "reps": 11, "side": "L" }, { "weight_kg": 7.9, "reps": 12, "side": "R" }] },
        { "exercise": "Cable Fly", "sets": [{ "weight_kg": 14, "reps": 10, "warmup": true }, { "weight_kg": 21, "reps": 8 }] }
      ]
    }
  ]
}
```
- `date` fehlt/`null` → heute (in der Vorschau änderbar), auch `TT.MM.JJJJ` möglich
- `weight_kg: null` → Körpergewicht, Sätze mit `reps: null` werden ignoriert
- `side` `L`/`R` → eigene Übung „… (links)“/„… (rechts)“
- `counts_as_reference: false` an einer Übung → wird nicht importiert
- Neue Übungen können in der Vorschau direkt in den Trainingstag (`workout_type`) aufgenommen werden (3 Sätze, Wdh.-Bereich aus den Daten)
- Ein App-Backup kann hier ebenfalls gewählt werden: dann werden nur fehlende Datensätze ergänzt.

## Stack
Vite · React 18 · TypeScript · Tailwind · Dexie (IndexedDB) · Recharts · vite-plugin-pwa · Vitest

## Entwicklung
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Unit-Tests (Progression, Metriken, DB)
npm run build      # Produktions-Build nach dist/
npm run preview
```

## Deployment (GitHub Pages)
1. Repo → *Settings → Pages → Source: GitHub Actions*.
2. Push auf `main` → Workflow `.github/workflows/deploy.yml` testet, baut und veröffentlicht unter
   `https://<user>.github.io/<repo>/`.
3. Auf dem Handy öffnen → „Zum Home-Bildschirm hinzufügen“. Danach läuft die App offline.

> ⚠️ Daten liegen nur im Browser des jeweiligen Geräts. Regelmäßig unter *Mehr → Backup exportieren* sichern.

## Struktur
```
src/
├─ db/            Dexie-Schema, Typen, Repositories, Seed, Backup
├─ domain/        reine Logik: progression, metrics, planRotation, units (getestet)
├─ features/      UI je Bereich: home, session, history, progress, manage, settings
├─ components/    UI-Bausteine (Button, Card, Modal, Stepper, BottomNav …)
└─ hooks/         useLookup
```
