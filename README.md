# ISOBAR

ISOBAR ist eine sachliche Wetteranwendung: Wettermodelle, Trends und
Unsicherheit ohne Werbung, Clickbait oder dramatisierende Texte.

## MVP

- aktuelles Wetter für einen frei wählbaren Ort
- Ortssuche über Open-Meteo Geocoding
- paralleler Vergleich von ICON, ECMWF IFS und GFS
- interaktive 36-Stunden-Kurven für Temperatur, Niederschlag und Wind
- 10-Tage-Ausblick als Median der verfügbaren Modelle
- transparente Modellspanne und einfache Übereinstimmungsbewertung
- zehn Minuten Cache mit Rückfall auf ältere Daten bei Provider-Ausfällen
- sechs kuratierte Farbpaletten mit automatischer Rotation pro Besuch
- Palette manuell wechseln oder dauerhaft festhalten
- lokale Speicherung der Farbwahl ohne Konto und ohne Tracking

## Architektur

Die Anwendung ist ein modularer Monolith mit klarer Server-Client-Grenze.

```text
Vue 3 / TypeScript
        │ REST / JSON
        ▼
Go HTTP Transport
        │
        ▼
Weather + Location Services
        │
        ▼
Provider Ports ─── Open-Meteo Adapter
```

Die Fachmodule kennen weder HTTP noch Open-Meteo. Ein weiterer Wetterprovider
kann über das `weather.Provider`-Interface ergänzt werden.

PostgreSQL ist in Compose vorbereitet, wird im MVP aber bewusst noch nicht
verwendet. Persistenz wird erst ergänzt, wenn gespeicherte Orte, historische
Prognosen oder Benutzerkonten einen tatsächlichen Datenbedarf schaffen.

## Lokal entwickeln

Backend:

```powershell
cd backend
go run ./cmd/api
```

Frontend in einem zweiten Terminal:

```powershell
cd frontend
npm install
npm run dev
```

Die Anwendung ist anschließend unter `http://localhost:5173` erreichbar.

## Mit Docker starten

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Danach läuft ISOBAR unter `http://localhost:8090`. Über `ISOBAR_PORT` kann ein anderer Port gewählt werden.

## REST API

```text
GET /api/v1/health
GET /api/v1/locations?q=Köln
GET /api/v1/weather?lat=50.9991&lon=7.0387&name=Köln
```

## Leitlinien

- Messung und Prognose werden nicht vermischt.
- Modellunterschiede werden gezeigt, nicht versteckt.
- Einordnung bleibt nüchtern und nachvollziehbar.
- Warnungen werden später nur aus amtlichen Quellen übernommen.
- Neue Produktbereiche werden als eigene Module ergänzt.

