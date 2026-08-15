import { percentage, signed, value } from '../helpers'
import { INTERPRETATION_THRESHOLDS as T } from '../thresholds'
import type { InterpretationInsight, InterpretationModule } from '../types'

const method = 'scenario-reading-v1.0.0'

const driverLabels = {
  modelSpread: 'die Modellstreuung',
  runShift: 'die Verschiebung zum vorherigen Lauf',
  horizon: 'der lange Prognosehorizont',
  missingModels: 'die unvollständige Modellabdeckung',
}

export const scenarioModule: InterpretationModule = {
  id: 'scenario',
  version: method,
  interpret(context) {
    const insights: InterpretationInsight[] = []
    const window = context.scenarioWindow
    const leading = window?.scenarios[0]
    if (window && leading) {
      const branchText = window.branchingScore >= T.scenarioBranching.stronglySeparated
        ? 'Die vollständigen Ensemblepfade teilen sich in klar getrennte mögliche Entwicklungen auf.'
        : window.branchingScore >= T.scenarioBranching.distinct
          ? 'Die Scenario Engine erkennt mehrere unterscheidbare Entwicklungswege.'
          : 'Die zusammenhängenden Szenariopfade liegen in diesem Zeitfenster vergleichsweise nah beieinander.'
      insights.push({
        id: 'scenario-paths',
        domain: 'scenario',
        priority: 100,
        tone: window.branchingScore >= T.scenarioBranching.stronglySeparated ? 'watch' : 'neutral',
        title: `${window.scenarios.length} Szenarien · Branching ${window.branchingScore}/100`,
        simple: window.branchingScore >= T.scenarioBranching.stronglySeparated
          ? 'Die Berechnungen entwickeln sich in deutlich verschiedene Richtungen. Die Lage kann sich mit neuen Modellläufen noch merklich ändern.'
          : window.branchingScore >= T.scenarioBranching.distinct
            ? 'Es gibt mehrere erkennbare Entwicklungen. Die grobe Richtung steht, einzelne Details können sich aber noch ändern.'
            : 'Die verschiedenen berechneten Entwicklungen ähneln sich momentan. Neue Modellläufe können die Einschätzung trotzdem noch verschieben.',
        plain: `${branchText} Der größte Pfad bündelt ${percentage(leading.modelBalancedShare)} der modellbalancierten Rohmasse im Fenster ${window.label}.`,
        technical: `${window.trajectoryCount} Trajektorien aus ${window.modelCount} Modellen; größtes Szenario ${leading.memberCount} Member aus ${leading.modelCount} Modellen.`,
        evidence: [
          { label: 'Branching Score', value: `${window.branchingScore}/100`, source: 'analysis.scenarios.windows.branchingScore' },
          { label: 'Größter Pfad', value: percentage(leading.modelBalancedShare), source: 'analysis.scenarios.windows.scenarios.modelBalancedShare' },
          { label: 'Trajektorien', value: String(window.trajectoryCount), source: 'analysis.scenarios.windows.trajectoryCount' },
        ],
        limitation: 'Szenarioanteile sind rohe Gewichte zusammenhängender Modellpfade und noch keine kalibrierten Eintrittswahrscheinlichkeiten.',
      })
    }

    const memory = context.runMemoryDay
    if (memory) {
      const stateText = memory.state === 'converging'
        ? 'Die jüngsten Modellläufe nähern sich für diesen Tag an.'
        : memory.state === 'diverging'
          ? 'Die jüngsten Modellläufe entfernen sich für diesen Tag voneinander; die Lösung ist zuletzt unruhiger geworden.'
          : 'Die jüngste Änderung liegt ungefähr im Bereich der zuvor typischen Laufänderungen.'
      insights.push({
        id: 'scenario-run-memory',
        domain: 'scenario',
        priority: 90,
        tone: memory.state === 'diverging' ? 'watch' : 'neutral',
        title: `${memory.runCount} archivierte Läufe · ${memory.state}`,
        plain: `${stateText} Der letzte P50-Sprung betrug ${signed(memory.latestShift)} K; ${memory.flipFlopCount} Richtungswechsel zeigen, wie oft das Signal bisher gekippt ist.`,
        technical: `Mittlere absolute Revision ${value(memory.meanAbsoluteShift)} K; Konvergenzindikator ${value(memory.convergence, 2)}; Flip-Flop-Rate ${percentage(memory.flipFlopRate)}.`,
        evidence: [
          { label: 'Läufe', value: String(memory.runCount), source: 'runMemory.daily.runCount' },
          { label: 'Letzte Revision', value: `${signed(memory.latestShift)} K`, source: 'runMemory.daily.latestShift' },
          { label: 'Richtungswechsel', value: String(memory.flipFlopCount), source: 'runMemory.daily.flipFlopCount' },
        ],
        limitation: 'Stabilität oder Konvergenz zwischen Läufen beweist nicht, dass die Prognose richtig ist.',
      })
    }

    const fragility = context.fragilityDay
    if (fragility) {
      insights.push({
        id: 'scenario-fragility',
        domain: 'scenario',
        priority: 85,
        tone: fragility.level === 'high' ? 'caution' : fragility.level === 'medium' ? 'watch' : 'neutral',
        title: `Änderungsanfälligkeit ${fragility.score}/100`,
        simple: fragility.level === 'high'
          ? 'Diese Einschätzung ist momentan deutlich änderungsanfällig. Neue Modellläufe können ein anderes Bild zeigen.'
          : fragility.level === 'medium'
            ? 'Einige Teile der Einschätzung können sich mit neuen Modellläufen noch verschieben.'
            : 'Die Einschätzung hat sich zuletzt vergleichsweise wenig verändert.',
        plain: `Der transparente Fragility Index stuft diesen Tag als ${fragility.level === 'high' ? 'stark' : fragility.level === 'medium' ? 'mittel' : 'wenig'} änderungsanfällig ein. Der größte Treiber ist ${driverLabels[fragility.primaryDriver]}.`,
        technical: Object.entries(fragility.factors).map(([key, factor]) => `${key} ${value(factor, 0)}`).join(' · '),
        evidence: [
          { label: 'Fragility', value: `${fragility.score}/100`, source: 'fragility.daily.score' },
          { label: 'Haupttreiber', value: driverLabels[fragility.primaryDriver], source: 'fragility.daily.primaryDriver' },
        ],
        limitation: 'Der Fragility Index ist eine erklärbare Heuristik, keine kalibrierte Fehlerwahrscheinlichkeit.',
      })
    }

    const runStability = context.runStabilityDay
    if (runStability) {
      insights.push({
        id: 'scenario-previous-run',
        domain: 'scenario',
        priority: 65,
        tone: 'neutral',
        title: 'Vergleich mit dem direkten Vorgängerlauf',
        plain: `Gegenüber dem direkt vorherigen Lauf verschob sich die Temperaturmitte um ${signed(runStability.temperatureP50Shift)} K und das rohe Regensignal um ${signed(runStability.rainProbability1mmShift)} Prozentpunkte.`,
        technical: `Spread-Änderung ${signed(runStability.temperatureSpreadShift)} K.`,
        evidence: [
          { label: 'P50-Verschiebung', value: `${signed(runStability.temperatureP50Shift)} K`, source: 'runStability.daily.temperatureP50Shift' },
          { label: 'Regensignal', value: `${signed(runStability.rainProbability1mmShift)} Pp`, source: 'runStability.daily.rainProbability1mmShift' },
        ],
        limitation: 'Der Vergleich beschreibt Revisionen zwischen zwei Läufen, nicht deren spätere Genauigkeit.',
      })
    }

    return {
      id: 'scenario',
      method,
      title: 'Szenarien und Laufentwicklung',
      kicker: 'Wie sich mögliche Entwicklungen verzweigen',
      availability: insights.length >= 2 ? 'available' : insights.length ? 'partial' : 'unavailable',
      summary: insights[0]?.plain ?? 'Für diesen Tag werden noch keine Szenarien oder archivierten Laufvergleiche veröffentlicht.',
      insights,
    }
  },
}
