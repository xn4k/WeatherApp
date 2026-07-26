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

## Spätere Firebase-Dienste

Auth und Firestore können innerhalb ihrer Spark-Kontingente modular ergänzt
werden. Serverseitige Cloud Functions und Cloud Run sind bewusst nicht Teil
dieser Variante.
