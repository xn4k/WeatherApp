# ISOBAR auf Firebase Spark

Dieser Ordner dokumentiert die kostenlose Firebase-Variante. Sie verwendet
denselben Vue-Code wie die Server-Version, aber den Buildmodus `firebase`.

Im Firebase-Build ruft der Browser Open-Meteo direkt auf. Es gibt keine Cloud
Function und keinen Cloud-Run-Dienst. Der bestehende Go-Server unter `backend/`
bleibt davon unberührt und wird weiterhin vom normalen Docker-/Server-Build
verwendet.

## Builds

```powershell
# Go-REST-Modus, lokal oder eigener Server
npm --prefix frontend run build

# Browser-Adapter für Firebase Spark
npm --prefix frontend run build:firebase
```

## Deployment

```powershell
npx firebase-tools deploy --only hosting
```

Firebase Hosting führt vor dem Deployment automatisch `build:firebase` aus.

## Firestore und zeitgesteuerter Collector

Firestore ist jetzt als optionaler öffentlicher Lesespeicher integriert. Der
Browser besitzt keine Schreibrechte. Ein GitHub-Actions-Workflow lädt alle sechs
Stunden die Modellläufe und schreibt sie mit einem privilegierten, niemals im
Repository gespeicherten Servicekonto.

Fehlt für einen Ort ein frischer Firestore-Lauf, verwendet der Firebase-Build
weiterhin den direkten Open-Meteo-Adapter. Cloud Functions und Cloud Run bleiben
bewusst außerhalb des Spark-Betriebs.

Die vollständige Erklärung steht in `docs/ARCHITECTURE.md`; Einrichtung und
Collector-Befehle stehen in `collector/README.md`.
