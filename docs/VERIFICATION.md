# Forecast-Verifikation und Skill-Gewichte

Diese Stufe macht aus gespeicherten Prognosen eine überprüfbare Zeitreihe. Sie behauptet nicht, dass ISOBAR bereits besser als seine Quellmodelle ist. Sie schafft die Daten, mit denen diese Aussage später getestet werden kann.

## Ablauf

```mermaid
flowchart LR
    A[Gespeicherter Forecast-Run] --> C[Zuordnung nach Gültigkeitstag]
    B[Historische Referenzanalyse] --> C
    C --> D[MAE · CRPS · Brier]
    D --> E[Aggregation pro Modell und Horizont]
    E --> F{Mindestens 14 verschiedene Tage?}
    F -->|Nein| G[Gleichgewichtete Fusion]
    F -->|Ja| H[Geschrumpfte und begrenzte Skill-Gewichte]
    G --> I[30-Tage-Labor]
    H --> I
```

GitHub Actions führt diesen Ablauf alle sechs Stunden aus. Die Verarbeitung ist idempotent: Für die Kombination aus Forecast-Run und Gültigkeitstag entsteht höchstens ein Score-Dokument.

## Referenzdaten

Die erste Referenzquelle ist die Open-Meteo Historical Forecast API mit `Best Match`. Open-Meteo setzt dafür die ersten Stunden aufeinanderfolgender, assimilierter Modellläufe zu einer historischen Zeitreihe zusammen.

ISOBAR bezeichnet diese Quelle ausdrücklich als `analysis-proxy`:

- Sie liegt näher an den analysierten Wetterbedingungen als eine alte Vorhersage.
- Sie ist global und im gleichen Tagesformat verfügbar.
- Sie ist keine lokale Stationsmessung und kein perfekter Ground Truth.
- Besonders für lokalen Niederschlag bleibt eine spätere DWD-Stationsanbindung fachlich wertvoll.

## Metriken

Für jeden Modell-Run und Gültigkeitstag werden gespeichert:

- Temperatur-MAE des Ensemblemedians;
- Temperatur-CRPS der vollständigen Ensembleverteilung;
- Niederschlags-MAE des Ensemblemedians;
- Brier Score für die Ereignisse `>= 1 mm` und `>= 10 mm`;
- Memberzahl, Ausgabezeitpunkt und Vorhersagehorizont.

Die Ergebnisse werden getrennt aggregiert für:

- Tag 0–3;
- Tag 4–7;
- Tag 8–15;
- Tag 16–30.

Ein Modell wird dadurch nicht für einen naturgemäß schwierigeren 15-Tage-Horizont mit seinen eigenen Kurzfristwerten vermischt.

## Aktivierungsregel

Skill-Gewichte werden erst ab 14 **verschiedenen Gültigkeitstagen** pro Modell und Horizont aktiviert. Vier Modellläufe desselben Tages zählen dabei nicht als vier unabhängige Tage.

Aktive Gewichte sind:

- nach Temperatur und Niederschlag getrennt;
- relativ zum Medianverlust der vergleichbaren Modelle berechnet;
- mit einer 30-Tage-Prior zur Gleichgewichtung hin geschrumpft;
- auf den Bereich `0,5` bis `2,0` begrenzt.

Fehlen genügend Daten, bleibt das neutrale Gewicht `1,0` aktiv. Die Wahrscheinlichkeiten bleiben auch mit Skill-Gewichten empirische Ensembleanteile; Gewichtung ist noch keine vollständige probabilistische Kalibrierung.

## Firestore-Struktur

```text
publicWeather/{locationId}
  latestOutlook.calibration

publicWeather/{locationId}/references/{yyyy-mm-dd}
  analysis proxy and source metadata

publicWeather/{locationId}/verification/{runId}_{yyyymmdd}
  lead bucket, reference and per-model scores

publicWeather/{locationId}/calibration/current
  rolling metrics and bounded weights
```

Die Aggregation verwendet ein rollierendes Fenster von maximal 3.000 Score-Dokumenten. Das hält Firestore-Reads im kostenlosen Betrieb begrenzt und verhindert, dass sehr alte Modellversionen unbegrenzt dominieren.

## Noch offen

- DWD-Stationsdaten als zusätzliche lokale Referenz;
- saisonale und wetterlagenabhängige Auswertung;
- echter Out-of-sample-Vergleich gegen die eingefrorene Gleichgewichts-Baseline;
- Reliability-Diagramme für Regenwahrscheinlichkeiten;
- Bias-Korrektur oder EMOS erst nach ausreichender Historie;
- Drift-Erkennung, wenn Provider ihre Modelle ändern.

Komplexität allein ist kein Qualitätsbeweis. Eine neue Gewichtung bleibt nur aktiv, wenn sie in einem getrennten Testzeitraum besser als die gleichgewichtete Baseline ist.
