# ISOBAR Weather Collector

Der Collector ersetzt im kostenlosen Firebase-Spark-Betrieb den fehlenden Dauer-Server. GitHub Actions startet ihn alle sechs Stunden. Er lädt Ensembleläufe, berechnet die Rohfusion und veröffentlicht versionierte Snapshots in Cloud Firestore.

## Lokal ohne Schreibzugriff testen

```powershell
cd collector
npm install
npm test
npm run collect:dry
```

Der Dry-Run benötigt keine Firebase-Zugangsdaten und schreibt nichts. Er ist der erste Test nach Änderungen an Modell-IDs oder API-Parsing.

## Firebase einmalig vorbereiten

1. In der Firebase Console Cloud Firestore als Standard-Datenbank anlegen.
2. Regeln und Indizes aus dem Repository deployen:

   ```powershell
   npx firebase-tools deploy --only firestore
   ```

3. Ein Servicekonto mit minimal benötigtem Firestore-Zugriff verwenden.
4. Den vollständigen Servicekonto-JSON-Inhalt ausschließlich als GitHub-Repository-Secret `FIREBASE_SERVICE_ACCOUNT_JSON` hinterlegen.
5. Den Workflow `Collect weather model runs` einmal manuell starten.

Ein Servicekonto ist ein echtes Geheimnis. Seine private Key-Datei darf niemals in `.env`, Git, einen Screenshot oder einen Browser-Build gelangen. Firebase-Web-Konfiguration und Servicekonto-Schlüssel sind zwei grundverschiedene Dinge.

## Standorte

Überwachte Orte stehen in `locations.json`. Die Dokument-ID wird auch im Frontend aus den auf vier Dezimalstellen gerundeten Koordinaten gebildet:

```text
50.9991, 7.0387 -> geo_50p9991_7p0387
-33.8688, 151.2093 -> geo_m33p8688_151p2093
```

Beliebige Suchorte funktionieren weiterhin über den direkten Browser-Adapter, besitzen aber erst dann eine zentrale Historie, wenn sie in dieser Liste gesammelt werden.

## Schreibvorgänge pro Lauf

Pro Standort entstehen ein aktuelles Standortdokument, ein Laufdokument und ein Dokument pro Modell. Beim aktuellen Modellsatz sind das acht Schreibvorgänge pro neuem Lauf. Identische Wiederholungen werden anhand des Payload-Hashs nicht erneut veröffentlicht.

## Fehlerverhalten

- Alle Modelle werden zunächst parallel geladen.
- Fehlgeschlagene Quellen werden genau einmal nacheinander wiederholt.
- Teilfehler werden als Warnung gespeichert.
- Unter zwei fusionierbaren Modellen schlägt der Lauf sichtbar fehl.
- Die bestehende veröffentlichte Prognose wird bei einem fehlgeschlagenen Lauf nicht überschrieben.

## Tests

Die Tests prüfen unter anderem, dass ein Modell mit 100 Mitgliedern nicht mehr Gesamtgewicht erhält als ein Modell mit einem Mitglied. Außerdem werden Parsing, Idempotenz und der Vergleich gemeinsamer Gültigkeitstage getestet.
