import { percentage, value } from '../helpers'
import { INTERPRETATION_THRESHOLDS as T } from '../thresholds'
import type { InterpretationInsight, InterpretationModule } from '../types'

const method = 'fusion-reading-v1.0.0'

export const fusionModule: InterpretationModule = {
  id: 'fusion',
  version: method,
  interpret(context) {
    const insights: InterpretationInsight[] = []
    const deterministic = context.deterministic

    if (deterministic) {
      const spread = deterministic.temperatureSpread
      const spreadText = spread === null
        ? 'Die Temperaturstreuung lässt sich für diesen Tag noch nicht berechnen.'
        : spread < T.temperatureSpread.narrowKelvin
          ? 'Die verfügbaren Einzelläufe liegen bei der Temperatur eng zusammen.'
          : spread < T.temperatureSpread.wideKelvin
            ? 'Die Einzelläufe unterscheiden sich sichtbar, zeichnen aber noch keine völlig gegensätzlichen Temperaturentwicklungen.'
            : 'Die Einzelläufe zeichnen deutlich unterschiedliche Temperaturentwicklungen; eine einzelne Zahl würde diese Bandbreite verschleiern.'
      insights.push({
        id: 'fusion-deterministic-spread',
        domain: 'fusion',
        priority: 95,
        tone: spread !== null && spread >= T.temperatureSpread.wideKelvin ? 'watch' : 'neutral',
        title: spread === null ? 'Modellstreuung sammelt' : `${value(spread)} K Modellspanne`,
        simple: spread === null
          ? undefined
          : spread < T.temperatureSpread.narrowKelvin
            ? 'Die verfügbaren Modelle liegen bei der Temperatur nah beieinander.'
            : spread < T.temperatureSpread.wideKelvin
              ? 'Die Modelle zeigen etwas unterschiedliche Temperaturen. Der grobe Trend ist trotzdem erkennbar.'
              : 'Die Modelle liegen deutlich auseinander. Der genaue Temperaturwert kann sich noch stärker ändern.',
        plain: spreadText,
        technical: `Größere der beiden Spannweiten aus Tagesminimum und Tagesmaximum: ${value(spread)} K über ${deterministic.modelCount} Modelle.`,
        evidence: [{ label: 'Modellspanne', value: `${value(spread)} K`, source: 'derived.maxModelRange' }],
        limitation: 'Nähe zwischen Modellen ist keine Trefferwahrscheinlichkeit; mehrere Modelle können gemeinsam falsch liegen.',
      })
    }

    const fusion = context.fusionDay
    if (fusion) {
      const uncertainty = context.uncertainty
      const corridor = fusion.temperatureP90 - fusion.temperatureP10
      const corridorText = corridor < T.ensembleCorridor.narrowKelvin
        ? 'Die meisten berechneten Temperaturverläufe liegen relativ eng beieinander. Größere Abweichungen sind trotzdem möglich.'
        : corridor < T.ensembleCorridor.wideKelvin
          ? 'Die Modelle zeigen eine erkennbare Bandbreite. Die ungefähre Richtung ist lesbar, der genaue Wert bleibt beweglich.'
          : 'Die berechneten Temperaturverläufe liegen weit auseinander. Für diesen Tag ist eine konkrete Zahl nur eine grobe Orientierung.'
      insights.push({
        id: 'fusion-corridor',
        domain: 'fusion',
        priority: 100,
        tone: corridor >= T.ensembleCorridor.wideKelvin ? 'watch' : 'neutral',
        title: corridor < T.ensembleCorridor.narrowKelvin
          ? 'Modelle relativ nah beieinander'
          : corridor < T.ensembleCorridor.wideKelvin
            ? 'Etwas Spielraum bleibt'
            : 'Große Bandbreite',
        simple: corridor < T.ensembleCorridor.narrowKelvin
          ? `Die meisten Berechnungen liegen zwischen ${value(fusion.temperatureP10)} und ${value(fusion.temperatureP90)} °C. Das ist eine eher enge Spanne.`
          : corridor < T.ensembleCorridor.wideKelvin
            ? `Die meisten Berechnungen liegen zwischen ${value(fusion.temperatureP10)} und ${value(fusion.temperatureP90)} °C. Der genaue Wert kann sich also noch etwas verschieben.`
            : `Die meisten Berechnungen liegen zwischen ${value(fusion.temperatureP10)} und ${value(fusion.temperatureP90)} °C. Diese große Spanne erlaubt nur eine grobe Orientierung.`,
        plain: `${corridorText} Der mittlere 80-%-Modellkorridor reicht von ${value(fusion.temperatureP10)} bis ${value(fusion.temperatureP90)} °C.`,
        technical: `P10–P90-Korridor ${value(corridor)} K; P10 ${value(fusion.temperatureP10)} °C; P90 ${value(fusion.temperatureP90)} °C.`,
        evidence: [
          { label: 'P10–P90-Breite', value: `${value(corridor)} K`, source: 'derived.fusionTemperatureCorridor' },
          { label: 'P10', value: `${value(fusion.temperatureP10)} °C`, source: 'fusion.daily.temperatureP10' },
          { label: 'P90', value: `${value(fusion.temperatureP90)} °C`, source: 'fusion.daily.temperatureP90' },
        ],
        limitation: 'Der Modellkorridor ist ohne historische Kalibrierung kein Garantieintervall und keine Trefferwahrscheinlichkeit.',
      })

      if (uncertainty) {
        const standardDeviation = Math.sqrt(uncertainty.temperature.totalVariance)
        const spreadText = standardDeviation < T.absoluteEnsembleSpread.narrowStandardDeviationKelvin
          ? 'Die gesamte modellierte Temperaturverteilung ist vergleichsweise kompakt.'
          : standardDeviation < T.absoluteEnsembleSpread.wideStandardDeviationKelvin
            ? 'Die Temperaturpfade besitzen eine sichtbare, aber noch moderate Bandbreite.'
            : 'Die Temperaturpfade liegen deutlich auseinander; die konkrete Ausprägung kann sich noch stärker verschieben.'
        const structureText = uncertainty.temperature.betweenShare >= uncertainty.temperature.withinShare
          ? 'Ein großer Teil der vorhandenen Varianz entsteht zwischen den Modellmitteln: Die Modellsysteme sehen die Lage strukturell unterschiedlich.'
          : 'Der größere Teil der vorhandenen Varianz liegt innerhalb der einzelnen Ensembles: Die Modellmittel sind näher beieinander als ihre Memberpfade.'
        insights.push({
          id: 'fusion-uncertainty',
          domain: 'fusion',
          priority: 90,
          tone: standardDeviation >= T.absoluteEnsembleSpread.wideStandardDeviationKelvin ? 'watch' : 'neutral',
          title: `${value(standardDeviation)} K absolute Streuung`,
          plain: `${spreadText} ${structureText}`,
          technical: `Gesamtvarianz ${value(uncertainty.temperature.totalVariance, 2)} K²; innerhalb der Modelle ${percentage(uncertainty.temperature.withinShare)}; zwischen Modellmitteln ${percentage(uncertainty.temperature.betweenShare)}.`,
          evidence: [
            { label: 'Absolute Streuung', value: `${value(standardDeviation)} K`, source: 'analysis.uncertainty.temperature.totalVariance' },
            { label: 'Innerhalb Modelle', value: percentage(uncertainty.temperature.withinShare), source: 'analysis.uncertainty.temperature.withinShare' },
            { label: 'Zwischen Modellen', value: percentage(uncertainty.temperature.betweenShare), source: 'analysis.uncertainty.temperature.betweenShare' },
          ],
          limitation: 'Varianzanteile erklären die Quelle der Streuung, nicht die Fehlerquote der Prognose.',
        })
      }

      const calibration = context.outlook.calibration
      const weighted = context.outlook.fusion?.method === 'skill-weighted-empirical'
      insights.push({
        id: 'fusion-composition',
        domain: 'fusion',
        priority: 80,
        tone: 'neutral',
        title: `${fusion.modelCount} Modelle · ${fusion.memberCount} Mitglieder`,
        plain: weighted
          ? `Die Fusion nutzt für diesen Horizont konservativ begrenzte Skill-Gewichte aus ${calibration?.distinctDays ?? 0} unabhängigen Verifikationstagen.`
          : 'Jedes verfügbare Modellsystem erhält zunächst dasselbe Gesamtgewicht, unabhängig von seiner Memberzahl.',
        technical: `${context.outlook.fusion?.method ?? 'keine Fusion'}; Kalibrierungsstatus ${calibration?.status ?? 'nicht verfügbar'}.`,
        evidence: [
          { label: 'Modelle', value: String(fusion.modelCount), source: 'fusion.daily.modelCount' },
          { label: 'Member', value: String(fusion.memberCount), source: 'fusion.daily.memberCount' },
          { label: 'Methode', value: context.outlook.fusion?.method ?? '—', source: 'fusion.method' },
        ],
        limitation: weighted
          ? 'Historische Skill-Gewichte sind noch keine vollständige probabilistische Kalibrierung.'
          : 'Gleichgewichtung ist eine transparente Baseline und behauptet nicht, dass jedes Modell gleich gut ist.',
      })
    }

    const availability = insights.length
      ? (context.fusionDay && !context.uncertainty ? 'partial' : 'available')
      : 'unavailable'
    return {
      id: 'fusion',
      method,
      title: 'Modelle, Fusion und Streuung',
      kicker: 'Woher die Bandbreite kommt',
      availability,
      summary: insights[0]?.plain ?? 'Für diesen Tag ist noch kein Modellvergleich verfügbar.',
      insights,
    }
  },
}
