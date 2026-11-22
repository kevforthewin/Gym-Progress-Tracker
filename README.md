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
- **Backup**: JSON-Export/Import (Daten liegen nur lokal in IndexedDB), Erinnerung nach 14 Tagen.

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
