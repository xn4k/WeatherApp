import { horizonLabel, percentage, value } from '../helpers'
import { INTERPRETATION_THRESHOLDS as T } from '../thresholds'
import type { InterpretationInsight, InterpretationModule } from '../types'

const method = 'weather-reading-v1.0.0'

function moistureText(humidity: number | null, dewPoint: number | null) {
  if (humidity === null || dewPoint === null) {
    return 'Für eine belastbare Feuchteeinordnung fehlen in diesem Lauf Luftfeuchte oder Taupunkt.'
  }
  if (humidity < T.moisture.dryHumidityPercent && dewPoint < T.moisture.dryDewPointCelsius) {
    return `Mit rund ${value(humidity, 0)} % relativer Feuchte und ${value(dewPoint)} °C Taupunkt wirkt das Tagesprofil eher trocken.`
  }
  if (humidity > T.moisture.humidHumidityPercent || dewPoint >= T.moisture.humidDewPointCelsius) {
    return `Rund ${value(humidity, 0)} % relative Feuchte und ${value(dewPoint)} °C Taupunkt sprechen für ein deutlich feuchteres, möglicherweise schwüles Tagesprofil.`
  }
  return `Mit rund ${value(humidity, 0)} % relativer Feuchte und ${value(dewPoint)} °C Taupunkt liegt die Feuchte im mittleren Bereich.`
}

function comfortText(temperature: number | null, apparent: number | null) {
  if (temperature === null || apparent === null) {
    return 'Die Daten reichen noch nicht aus, um Lufttemperatur und modellierte Gefühlstemperatur seriös zu vergleichen.'
  }
  const difference = apparent - temperature
  if (difference >= T.apparentTemperature.noticeableDifferenceKelvin) {
    return `Die modellierte Gefühlstemperatur liegt etwa ${value(difference)} K über der Lufttemperatur. Feuchte, Wind und Strahlung verstärken damit das Wärmeempfinden.`
  }
  if (difference <= -T.apparentTemperature.noticeableDifferenceKelvin) {
    return `Die modellierte Gefühlstemperatur liegt etwa ${value(Math.abs(difference))} K unter der Lufttemperatur. Wind und Strahlungsbedingungen dämpfen das Wärmeempfinden.`
  }
  return 'Modellierte Gefühlstemperatur und Lufttemperatur liegen nah beieinander; ein größerer zusätzlicher Komforteffekt ist in diesen Tageswerten nicht sichtbar.'
}

export const weatherModule: InterpretationModule = {
  id: 'weather',
  version: method,
  interpret(context) {
    const insights: InterpretationInsight[] = []
    const fusion = context.fusionDay
    const deterministic = context.deterministic

    if (!fusion && !deterministic) {
      return {
        id: 'weather',
        method,
        title: 'Wetterlage und Gefühl',
        kicker: 'Was der Tag praktisch bedeutet',
        availability: 'unavailable',
        summary: 'Für diesen Tag liegt noch keine vollständige Wetterverteilung vor.',
        insights: [],
      }
    }

    const temperature = fusion?.temperatureP50 ?? deterministic?.temperatureMax ?? null
    const apparent = fusion?.apparentTemperatureP50
      ?? fusion?.apparentTemperatureMaxP50
      ?? deterministic?.apparentTemperature
      ?? null
    const humidity = fusion?.relativeHumidityP50 ?? deterministic?.relativeHumidity ?? null
    const dewPoint = fusion?.dewPointP50 ?? deterministic?.dewPoint ?? null
    const wind = fusion?.windSpeedP50 ?? deterministic?.windSpeed ?? null

    if (fusion) {
      const previous = context.previousFusionDay
      const trend = previous ? fusion.temperatureP50 - previous.temperatureP50 : null
      const trendText = trend === null
        ? 'Für den ersten dargestellten Tag gibt es keinen Vortagsvergleich innerhalb der Kurve.'
        : Math.abs(trend) < T.dayTrend.noticeableKelvin
          ? 'Gegenüber dem vorherigen Tag verändert sich die Temperaturmitte nur wenig.'
          : trend > 0
            ? `Gegenüber dem vorherigen Tag steigt die Temperaturmitte um etwa ${value(trend)} K.`
            : `Gegenüber dem vorherigen Tag sinkt die Temperaturmitte um etwa ${value(Math.abs(trend))} K.`
      const simpleTrendText = trend === null || Math.abs(trend) < T.dayTrend.noticeableKelvin
        ? ''
        : trend > 0
          ? ` Das sind rund ${value(trend)} Grad mehr als am Vortag.`
          : ` Das sind rund ${value(Math.abs(trend))} Grad weniger als am Vortag.`
      insights.push({
        id: 'weather-temperature',
        domain: 'weather',
        priority: 100,
        tone: 'neutral',
        title: `${value(fusion.temperatureP50)} °C in der Modellmitte`,
        simple: `Für diesen Tag zeigen die Wettermodelle ungefähr ${value(fusion.temperatureP50)} °C.${simpleTrendText}`,
        plain: `Für den ${horizonLabel(context.leadIndex)} liegt die modellbalancierte Mitte bei ${value(fusion.temperatureP50)} °C. ${trendText}`,
        technical: `P50 ${value(fusion.temperatureP50)} °C; P10 bis P90 ${value(fusion.temperatureP10)}–${value(fusion.temperatureP90)} °C.`,
        evidence: [
          { label: 'Temperatur P50', value: `${value(fusion.temperatureP50)} °C`, source: 'fusion.daily.temperatureP50' },
          { label: 'P10–P90', value: `${value(fusion.temperatureP10)}–${value(fusion.temperatureP90)} °C`, source: 'fusion.daily.temperatureP10/temperatureP90' },
        ],
        limitation: 'Der Median ist die Mitte der aktuellen Modellverteilung, keine garantierte Temperatur.',
      })

      const rain = fusion.rainProbability1mm
      const rainText = rain >= T.rainSignal.strongPercent
        ? 'Ein großer Anteil der modellbalancierten Ensemblemitglieder berechnet mindestens 1 mm Niederschlag.'
        : rain >= T.rainSignal.elevatedPercent
          ? 'Das Niederschlagssignal ist geteilt bis erhöht; trockene und nasse Entwicklungen bleiben vertreten.'
          : rain <= T.rainSignal.lowPercent
            ? 'Die deutliche Mehrheit der modellbalancierten Ensemblemitglieder bleibt unter 1 mm Niederschlag.'
            : 'Es gibt ein schwaches Niederschlagssignal, aber die trockenen Entwicklungen überwiegen noch.'
      const simpleRainText = rain >= T.rainSignal.strongPercent
        ? 'Viele Berechnungen zeigen für diesen Tag Regen. Wie viel genau fällt, bleibt noch offen.'
        : rain >= T.rainSignal.elevatedPercent
          ? 'Trockene und regnerische Verläufe sind beide gut vertreten. Regen solltest du für diesen Tag noch einplanen.'
          : rain <= T.rainSignal.lowPercent
            ? 'Die meisten Berechnungen bleiben für diesen Tag trocken.'
            : 'Regen ist in einigen Berechnungen vorhanden, die trockenen Verläufe überwiegen aber.'
      insights.push({
        id: 'weather-rain',
        domain: 'weather',
        priority: 90,
        tone: rain >= T.rainSignal.strongPercent ? 'watch' : 'neutral',
        title: `${percentage(rain)} rohes Regensignal`,
        simple: simpleRainText,
        plain: rainText,
        technical: `Modellbalancierter Anteil ≥ 1 mm: ${percentage(rain)}; ≥ 10 mm: ${percentage(fusion.rainProbability10mm)}. Niederschlagsmedian ${value(fusion.precipitationP50)} mm.`,
        evidence: [
          { label: '≥ 1 mm', value: percentage(rain), source: 'fusion.daily.rainProbability1mm' },
          { label: '≥ 10 mm', value: percentage(fusion.rainProbability10mm), source: 'fusion.daily.rainProbability10mm' },
          { label: 'Niederschlag P50', value: `${value(fusion.precipitationP50)} mm`, source: 'fusion.daily.precipitationP50' },
        ],
        limitation: 'Das ist ein roher Ensembleanteil und nur dann eine kalibrierte Wahrscheinlichkeit, wenn die separate Verifikation dies ausdrücklich ausweist.',
      })
    } else if (deterministic) {
      const wetText = deterministic.wetModelCount === 0
        ? 'Keiner der verfügbaren Einzelläufe berechnet mindestens 1 mm Niederschlag.'
        : deterministic.wetModelCount === deterministic.modelCount
          ? 'Alle verfügbaren Einzelläufe berechnen mindestens 1 mm Niederschlag.'
          : `${deterministic.wetModelCount} von ${deterministic.modelCount} Einzelläufen berechnen mindestens 1 mm Niederschlag.`
      insights.push({
        id: 'weather-deterministic',
        domain: 'weather',
        priority: 100,
        tone: 'neutral',
        title: `${value(deterministic.temperatureMin)}–${value(deterministic.temperatureMax)} °C im Modellzentrum`,
        simple: `Die verfügbaren Wettermodelle erwarten ungefähr ${value(deterministic.temperatureMin)} bis ${value(deterministic.temperatureMax)} °C. ${wetText}`,
        plain: `Die Medianwerte der verfügbaren Einzelläufe liegen zwischen ${value(deterministic.temperatureMin)} und ${value(deterministic.temperatureMax)} °C. ${wetText}`,
        technical: `Median aus ${deterministic.modelCount} Einzelläufen; Niederschlagsmedian ${value(deterministic.precipitationMedian)} mm.`,
        evidence: [
          { label: 'Einzelläufe', value: String(deterministic.modelCount), source: 'models[].daily' },
          { label: 'Regenvotum', value: `${deterministic.wetModelCount}/${deterministic.modelCount}`, source: 'models[].daily.precipitation' },
        ],
        limitation: 'Ein Modellvotum ist keine historisch kalibrierte Eintrittswahrscheinlichkeit.',
      })
    }

    const comfortParts = [
      temperature !== null && apparent !== null ? comfortText(temperature, apparent) : null,
      humidity !== null && dewPoint !== null ? moistureText(humidity, dewPoint) : null,
      wind !== null ? `Der modellierte Tagesmittelwind liegt bei rund ${value(wind)} km/h.` : null,
    ].filter((part): part is string => Boolean(part))
    if (comfortParts.length) {
      insights.push({
        id: 'weather-comfort',
        domain: 'weather',
        priority: 70,
        tone: 'neutral',
        title: 'So könnte sich der Tag anfühlen',
        simple: comfortParts.join(' '),
        plain: comfortParts.join(' '),
        technical: `Lufttemperatur ${value(temperature)} °C; Gefühlstemperatur ${value(apparent)} °C; relative Feuchte ${value(humidity, 0)} %; Taupunkt ${value(dewPoint)} °C; Wind ${value(wind)} km/h.`,
        evidence: [
          { label: 'Gefühlt', value: `${value(apparent)} °C`, source: 'daily.apparentTemperature' },
          { label: 'Relative Feuchte', value: `${value(humidity, 0)} %`, source: 'daily.relativeHumidity' },
          { label: 'Taupunkt', value: `${value(dewPoint)} °C`, source: 'daily.dewPoint' },
          { label: 'Wind', value: `${value(wind)} km/h`, source: 'daily.windSpeed' },
        ],
        limitation: 'Tagesmittel können kurze Spitzen, lokale Schatten- und Strahlungseffekte oder gesundheitliche Belastungen nicht vollständig abbilden.',
      })
    }

    return {
      id: 'weather',
      method,
      title: 'Wetterlage und Gefühl',
      kicker: 'Was der Tag praktisch bedeutet',
      availability: insights.some((insight) => insight.evidence.some((item) => !item.value.includes('—'))) ? 'available' : 'partial',
      summary: insights[0]?.plain ?? 'Für diesen Tag liegen nur Teilinformationen vor.',
      insights,
    }
  },
}
