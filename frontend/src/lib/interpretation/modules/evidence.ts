import { percentage, signed, value } from '../helpers'
import type { InterpretationInsight, InterpretationModule } from '../types'

const method = 'evidence-reading-v1.0.0'

export const evidenceModule: InterpretationModule = {
  id: 'evidence',
  version: method,
  interpret(context) {
    const insights: InterpretationInsight[] = []
    const calibration = context.outlook.calibration
    const gate = calibration?.evidence?.gate ?? context.outlook.evidence?.gate

    if (calibration) {
      const active = calibration.status === 'active'
      insights.push({
        id: 'evidence-learning',
        domain: 'evidence',
        priority: 100,
        tone: active ? 'positive' : 'neutral',
        title: `${calibration.distinctDays}/${calibration.minimumDays} unabhängige Verifikationstage`,
        plain: active
          ? `Für mindestens einen Prognosehorizont sind konservativ begrenzte Skill-Gewichte aktiv. Grundlage sind ${calibration.distinctDays} verschiedene Gültigkeitstage und ${calibration.scoredForecasts} bewertete Modellprognosen.`
          : `ISOBAR sammelt noch Vergleichstage. Mehrere Läufe desselben Tages zählen dabei bewusst nur als ein unabhängiger Tag; bis zur Mindestmenge bleibt die neutrale Fusion aktiv.`,
        technical: `${calibration.referenceKind}; aktive Buckets: ${calibration.activeBuckets.join(', ') || 'keine'}; ${calibration.notice}`,
        evidence: [
          { label: 'Unabhängige Tage', value: String(calibration.distinctDays), source: 'calibration.distinctDays' },
          { label: 'Mindestmenge', value: String(calibration.minimumDays), source: 'calibration.minimumDays' },
          { label: 'Bewertete Prognosen', value: String(calibration.scoredForecasts), source: 'calibration.scoredForecasts' },
        ],
        limitation: 'Skill-Gewichtung ist noch keine vollständige Wahrscheinlichkeitskalibrierung und kein Beweis gegen kommerzielle Wetterprodukte.',
      })
    }

    if (gate) {
      const gateText = gate.promotionEligible
        ? 'Der Shadow-Challenger erfüllt die statistische Mindestbedingung für eine manuelle Prüfung. Er wird trotzdem nicht automatisch live geschaltet.'
        : gate.status === 'baseline-retained'
          ? 'Die bisherige Baseline bleibt erhalten, weil der Challenger das getrennte Zukunfts-Gate nicht überzeugend bestanden hat.'
          : `Das Zukunfts-Gate sammelt weiter: ${gate.distinctDays} von mindestens ${gate.minimumDays} unabhängigen Tagen sind ausgewertet.`
      insights.push({
        id: 'evidence-gate',
        domain: 'evidence',
        priority: 95,
        tone: gate.promotionEligible ? 'positive' : 'neutral',
        title: gate.promotionEligible ? 'Challenger prüfbar' : 'Live-Baseline bleibt geschützt',
        plain: gateText,
        technical: `Champion CRPS ${value(gate.baselineCrps, 3)}; Shadow CRPS ${value(gate.shadowCrps, 3)}; mittlere Verbesserung ${signed(gate.meanImprovement, 3)}; untere 95-%-Grenze ${signed(gate.lowerConfidence95, 3)}.`,
        evidence: [
          { label: 'Gate-Tage', value: `${gate.distinctDays}/${gate.minimumDays}`, source: 'evidence.gate.distinctDays/minimumDays' },
          { label: 'Promotion möglich', value: gate.promotionEligible ? 'ja' : 'nein', source: 'evidence.gate.promotionEligible' },
          { label: 'Untere 95-%-Grenze', value: signed(gate.lowerConfidence95, 3), source: 'evidence.gate.lowerConfidence95' },
        ],
        limitation: 'Selbst promotionEligible löst keinen automatischen Produktivwechsel aus; die Entscheidung bleibt versioniert und manuell.',
      })
    }

    const reference = context.outlook.referenceProfile
    if (reference) {
      const measured = reference.status === 'active' && reference.station
      insights.push({
        id: 'evidence-reference',
        domain: 'evidence',
        priority: 80,
        tone: measured ? 'positive' : 'watch',
        title: measured ? 'DWD-Stationsmessung als Referenz' : 'Analysis-Proxy als markierter Fallback',
        plain: measured
          ? `Vergangene Prognosen werden bevorzugt gegen Messwerte der Station ${reference.station?.name} geprüft. Stationskennung, Entfernung und Qualitätsstatus bleiben sichtbar.`
          : 'Für den jüngsten abgeschlossenen Tag fehlt aktuell eine passende Stationsmessung; die Pipeline verwendet deshalb einen ausdrücklich markierten Analysis-Proxy.',
        technical: `${reference.method}; letzte Beobachtung ${reference.latestObservationDate ?? '—'}; Qualität ${reference.latestQualityStatus ?? '—'}.`,
        evidence: [
          { label: 'Referenzstatus', value: reference.status, source: 'referenceProfile.status' },
          { label: 'Station', value: reference.station ? `${reference.station.id} · ${reference.station.name}` : 'Analysis-Proxy', source: 'referenceProfile.station' },
        ],
        limitation: measured
          ? 'Eine einzelne Station repräsentiert nicht jede kleinräumige Wetterausprägung des Standorts.'
          : 'Der Analysis-Proxy ist keine lokale Messung und wird nicht als Ground Truth ausgegeben.',
      })
    }

    const mosmix = context.mosmixDay
    const fusion = context.fusionDay
    if (mosmix && fusion) {
      const difference = mosmix.temperatureMean - fusion.temperatureP50
      insights.push({
        id: 'evidence-mosmix',
        domain: 'evidence',
        priority: 65,
        tone: Math.abs(difference) >= 3 ? 'watch' : 'neutral',
        title: `MOSMIX liegt ${signed(difference)} K zur Fusion`,
        plain: Math.abs(difference) < 1
          ? 'Die stationsoptimierte MOSMIX-Punktprognose und die ISOBAR-Fusion liegen bei der Tagesmitteltemperatur nah beieinander.'
          : 'Die stationsoptimierte MOSMIX-Punktprognose setzt für diesen Tag einen sichtbar anderen Temperaturakzent als die ISOBAR-Fusion.',
        technical: `MOSMIX ${value(mosmix.temperatureMean)} °C; Fusion P50 ${value(fusion.temperatureP50)} °C; MOSMIX-Niederschlag ${value(mosmix.precipitationSum)} mm.`,
        evidence: [
          { label: 'MOSMIX', value: `${value(mosmix.temperatureMean)} °C`, source: 'challengers.mosmix.daily.temperatureMean' },
          { label: 'Abstand zur Fusion', value: `${signed(difference)} K`, source: 'derived.mosmixMinusFusion' },
        ],
        limitation: 'MOSMIX ist ein separater stationsoptimierter Challenger und keine zusätzliche Stimme in der Fusion.',
      })
    }

    const challenger = context.challengerDay
    if (challenger) {
      insights.push({
        id: 'evidence-calibration-challenger',
        domain: 'evidence',
        priority: 60,
        tone: challenger.parameterStatus === 'eligible-shadow' ? 'positive' : 'neutral',
        title: `Kalibrierungs-Challenger: ${challenger.parameterStatus}`,
        plain: challenger.parameterStatus === 'eligible-shadow'
          ? 'Für diesen Horizont kann die vorbereitete Bias- und Spread-Korrektur im Shadow-Modus berechnet werden. Das Live-Ergebnis bleibt unverändert.'
          : 'Für diesen Horizont sammelt die vorbereitete Bias- und Spread-Korrektur noch Daten und bleibt vollständig außerhalb der Live-Prognose.',
        technical: `Shadow P10/P50/P90 ${value(challenger.temperatureP10)}/${value(challenger.temperatureP50)}/${value(challenger.temperatureP90)} °C.`,
        evidence: [
          { label: 'Parameterstatus', value: challenger.parameterStatus, source: 'calibrationChallenger.daily.parameterStatus' },
          { label: 'Shadow P50', value: `${value(challenger.temperatureP50)} °C`, source: 'calibrationChallenger.daily.temperatureP50' },
        ],
        limitation: 'Der Challenger ist ausdrücklich live: false und darf die veröffentlichte Prognose nicht verändern.',
      })
    }

    const diagnostic = calibration?.diagnostics?.buckets[context.leadBucket]
    if (diagnostic) {
      const temperature = diagnostic.baseline.temperature
      insights.push({
        id: 'evidence-diagnostics',
        domain: 'evidence',
        priority: 55,
        tone: 'neutral',
        title: `Diagnostik für ${context.leadBucket}`,
        plain: `Für diesen Horizont liegen ${diagnostic.distinctDays} verschiedene Prüftage vor. CRPS bewertet die gesamte Temperaturverteilung; Brier Scores prüfen die rohen Regenereignissignale.`,
        technical: `Temperatur-CRPS ${value(temperature.meanCrps, 3)}; 80-%-Intervallabdeckung ${percentage(temperature.intervalCoverage80)}; Brier ≥1 mm ${value(diagnostic.baseline.rain1mm?.brier, 3)}.`,
        evidence: [
          { label: 'Prüftage', value: String(diagnostic.distinctDays), source: 'calibration.diagnostics.buckets.distinctDays' },
          { label: 'Temperatur CRPS', value: value(temperature.meanCrps, 3), source: 'calibration.diagnostics.baseline.temperature.meanCrps' },
          { label: 'Intervallabdeckung', value: percentage(temperature.intervalCoverage80), source: 'calibration.diagnostics.baseline.temperature.intervalCoverage80' },
        ],
        limitation: 'Kleine Stichproben und leere Reliability-Bins bleiben unsicher und werden nicht als belastbare Kalibrierung verkauft.',
      })
    }

    return {
      id: 'evidence',
      method,
      title: 'Evidence Engine und Lernstand',
      kicker: 'Was bereits überprüft wurde',
      availability: insights.length >= 3 ? 'available' : insights.length ? 'partial' : 'unavailable',
      summary: insights[0]?.plain ?? 'Für diesen Standort ist noch kein zentraler Evidence- und Verifikationsstatus veröffentlicht.',
      insights,
    }
  },
}
