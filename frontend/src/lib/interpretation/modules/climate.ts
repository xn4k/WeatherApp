import { percentage, signed, value } from '../helpers'
import { INTERPRETATION_THRESHOLDS as T } from '../thresholds'
import type { InterpretationInsight, InterpretationModule } from '../types'

const method = 'climate-reading-v1.0.0'

export const climateModule: InterpretationModule = {
  id: 'climate',
  version: method,
  interpret(context) {
    const climate = context.climate
    const forecast = context.fusionDay?.temperatureP50 ?? context.deterministic?.temperatureMax ?? null
    if (!climate) {
      return {
        id: 'climate',
        method,
        title: 'Climate Time Machine',
        kicker: 'Wie ungewöhnlich der Kalendertag wäre',
        availability: 'unavailable',
        summary: 'Für den ausgewählten Kalendertag wurde noch kein passender DWD-Klimaausschnitt geladen.',
        insights: [],
      }
    }

    const insights: InterpretationInsight[] = []
    const anomaly = Number.isFinite(forecast) && Number.isFinite(climate.temperatureP50)
      ? Number(forecast) - Number(climate.temperatureP50)
      : null
    const historyTemperatures = climate.history
      .map((entry) => entry.temperatureMean)
      .filter(Number.isFinite) as number[]
    const percentile = Number.isFinite(forecast) && historyTemperatures.length
      ? Math.round(100 * historyTemperatures.filter((temperature) => temperature <= Number(forecast)).length / historyTemperatures.length)
      : null

    const anomalyText = anomaly === null
      ? 'Prognose und historische Klimamitte lassen sich für diesen Tag noch nicht direkt vergleichen.'
      : Math.abs(anomaly) < T.climateAnomaly.noticeableKelvin
        ? 'Die prognostizierte Temperatur liegt nahe an der historischen Mitte dieses Kalendertags.'
        : anomaly >= T.climateAnomaly.strongKelvin
          ? 'Die Prognose liegt deutlich über der historischen Mitte dieses Kalendertags.'
          : anomaly > 0
            ? 'Die Prognose liegt etwas über der historischen Mitte dieses Kalendertags.'
            : anomaly <= -T.climateAnomaly.strongKelvin
              ? 'Die Prognose liegt deutlich unter der historischen Mitte dieses Kalendertags.'
              : 'Die Prognose liegt etwas unter der historischen Mitte dieses Kalendertags.'

    insights.push({
      id: 'climate-anomaly',
      domain: 'climate',
      priority: 100,
      tone: anomaly !== null && Math.abs(anomaly) >= T.climateAnomaly.strongKelvin ? 'watch' : 'neutral',
      title: anomaly === null ? 'Historischer Vergleich sammelt' : `${signed(anomaly)} K zur Klimamitte`,
      simple: anomaly === null
        ? undefined
        : Math.abs(anomaly) < T.climateAnomaly.noticeableKelvin
          ? 'Im Vergleich zu früheren Messjahren liegt dieser Kalendertag ungefähr im üblichen Temperaturbereich.'
          : anomaly >= T.climateAnomaly.strongKelvin
            ? `Dieser Tag wäre im historischen Vergleich ungewöhnlich warm. Der Modellwert liegt rund ${value(anomaly)} Grad über der langjährigen Mitte.`
            : anomaly > 0
              ? `Dieser Tag wäre etwas wärmer als für dieses Datum üblich. Der Modellwert liegt rund ${value(anomaly)} Grad über der langjährigen Mitte.`
              : anomaly <= -T.climateAnomaly.strongKelvin
                ? `Dieser Tag wäre im historischen Vergleich ungewöhnlich kühl. Der Modellwert liegt rund ${value(Math.abs(anomaly))} Grad unter der langjährigen Mitte.`
                : `Dieser Tag wäre etwas kühler als für dieses Datum üblich. Der Modellwert liegt rund ${value(Math.abs(anomaly))} Grad unter der langjährigen Mitte.`,
      plain: `${anomalyText}${percentile === null ? '' : ` Der Prognosewert wäre wärmer als ungefähr ${percentile} % der verfügbaren Messjahre für diesen Kalendertag.`}`,
      technical: `Normalperiode ${climate.referencePeriod.start}–${climate.referencePeriod.end}; P10/P50/P90 ${value(climate.temperatureP10)}/${value(climate.temperatureP50)}/${value(climate.temperatureP90)} °C; ${climate.referenceSampleYears} Referenzjahre.`,
      evidence: [
        { label: 'Abweichung', value: `${signed(anomaly)} K`, source: 'derived.forecastMinusClimateP50' },
        { label: 'Historisches Perzentil', value: percentile === null ? '—' : percentage(percentile), source: 'derived.climateHistoryPercentile' },
        { label: 'Normalperiode', value: `${climate.referencePeriod.start}–${climate.referencePeriod.end}`, source: 'climate.referencePeriod' },
      ],
      limitation: 'Ein einzelner ungewöhnlicher Tag belegt keinen Klimatrend; verglichen wird nur derselbe Kalendertag in der Stationshistorie.',
    })

    insights.push({
      id: 'climate-rain-history',
      domain: 'climate',
      priority: 70,
      tone: 'neutral',
      title: 'Regen im historischen Kontext',
      plain: `In der verfügbaren Stationsreihe brachte dieser Kalendertag in ${percentage(climate.rainFrequency1mm)} der Jahre mindestens 1 mm und in ${percentage(climate.rainFrequency10mm)} mindestens 10 mm Niederschlag.`,
      technical: `Station ${climate.station.id} ${climate.station.name}; Archiv ${climate.firstYear}–${climate.lastYear}; ${climate.sampleYears} Jahre mit verfügbaren Daten.`,
      evidence: [
        { label: 'Historisch ≥ 1 mm', value: percentage(climate.rainFrequency1mm), source: 'climate.rainFrequency1mm' },
        { label: 'Historisch ≥ 10 mm', value: percentage(climate.rainFrequency10mm), source: 'climate.rainFrequency10mm' },
        { label: 'Station', value: `${climate.station.id} · ${climate.station.name}`, source: 'climate.station' },
      ],
      limitation: 'Historische Häufigkeit ist keine Vorhersage für den ausgewählten Tag und ersetzt das aktuelle Ensemble nicht.',
    })

    return {
      id: 'climate',
      method,
      title: 'Climate Time Machine',
      kicker: 'Wie ungewöhnlich der Kalendertag wäre',
      availability: forecast === null ? 'partial' : 'available',
      summary: insights[0].plain,
      insights,
    }
  },
}
