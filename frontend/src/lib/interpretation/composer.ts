import type { ClimateDay } from '../../types/evidence'
import type { Outlook } from '../../types/outlook'
import { buildInterpretationContext } from './context'
import { value } from './helpers'
import { climateModule } from './modules/climate'
import { evidenceModule } from './modules/evidence'
import { fusionModule } from './modules/fusion'
import { qualityModule } from './modules/quality'
import { scenarioModule } from './modules/scenario'
import { weatherModule } from './modules/weather'
import { INTERPRETATION_THRESHOLDS as T } from './thresholds'
import {
  INTERPRETATION_METHOD,
  type ForecastBriefing,
  type InterpretationDomain,
  type InterpretationModule,
} from './types'

export const interpretationModules: InterpretationModule[] = [
  weatherModule,
  fusionModule,
  scenarioModule,
  climateModule,
  evidenceModule,
  qualityModule,
]

export function availableInterpretationDates(outlook: Outlook) {
  if (outlook.mode === 'ensemble') {
    return outlook.fusion?.daily.map((day) => day.date) ?? []
  }
  return [...new Set((outlook.models ?? []).flatMap((model) =>
    model.daily.map((day) => day.date),
  ))].sort()
}

function readingStatus(context: ReturnType<typeof buildInterpretationContext>): Pick<ForecastBriefing, 'status' | 'statusLabel'> {
  if (context.outlook.dataQuality?.health === 'critical') {
    return { status: 'unknown', statusLabel: 'Datenlage kritisch' }
  }
  if (context.fragilityDay) {
    if (context.fragilityDay.level === 'high') return { status: 'open', statusLabel: 'Entwicklung noch offen' }
    if (context.fragilityDay.level === 'medium') return { status: 'mixed', statusLabel: 'Mehrere Signale bleiben' }
    return { status: 'robust', statusLabel: 'Aktuell wenig änderungsanfällig' }
  }
  if (context.deterministic?.temperatureSpread !== null && context.deterministic) {
    const spread = context.deterministic.temperatureSpread
    if (spread >= T.temperatureSpread.wideKelvin || context.leadIndex >= 10) {
      return { status: 'open', statusLabel: 'Entwicklung noch offen' }
    }
    if (spread >= T.temperatureSpread.narrowKelvin || context.leadIndex >= 5) {
      return { status: 'mixed', statusLabel: 'Gemischtes Modellsignal' }
    }
    return { status: 'robust', statusLabel: 'Modelle eng beieinander' }
  }
  return { status: 'unknown', statusLabel: 'Einschätzung sammelt' }
}

function headline(context: ReturnType<typeof buildInterpretationContext>) {
  if (context.fusionDay) {
    return `${value(context.fusionDay.temperatureP50)} °C P50 · ${value(context.fusionDay.temperatureP10)}–${value(context.fusionDay.temperatureP90)} °C Modellkorridor`
  }
  if (context.deterministic) {
    return `${value(context.deterministic.temperatureMin)}–${value(context.deterministic.temperatureMax)} °C im Modellzentrum`
  }
  return 'Für diesen Tag liegt noch keine vollständige Interpretation vor.'
}

export function buildForecastBriefing(
  outlook: Outlook,
  date: string,
  climate: ClimateDay | null = null,
): ForecastBriefing | null {
  if (!date) return null
  const context = buildInterpretationContext(outlook, date, climate)
  if (!context.fusionDay && !context.deterministic) return null

  const sections = interpretationModules.map((module) => module.interpret(context))
  const coverage = sections.reduce<ForecastBriefing['coverage']>((result, section) => {
    result[section.availability].push(section.id)
    return result
  }, { available: [], partial: [], unavailable: [] })
  const status = readingStatus(context)

  return {
    method: INTERPRETATION_METHOD,
    date,
    mode: outlook.mode,
    ...status,
    headline: headline(context),
    summary: sections.map((section) => section.summary),
    sections,
    coverage,
    modelRows: context.deterministic?.modelDays.map(({ id, short, day }) => ({
      id,
      short,
      temperatureMin: day.temperatureMin,
      temperatureMax: day.temperatureMax,
      precipitation: day.precipitation,
      apparentTemperatureMax: day.apparentTemperatureMax ?? null,
      relativeHumidityMean: day.relativeHumidityMean ?? null,
    })) ?? [],
    globalLimit: outlook.mode === 'ensemble'
      ? 'ISOBAR erklärt die aktuell sichtbare Modellverteilung und ihre bisherige Verifikation. Rohe Ensemble-, Szenario- und Fragility-Werte sind keine automatisch kalibrierten Trefferwahrscheinlichkeiten.'
      : 'Die Einzellaufansicht vergleicht Modelllösungen. Übereinstimmung zwischen Modellen ist keine Garantie und ersetzt keine spätere Verifikation gegen Beobachtungen.',
  }
}

export function coverageLabel(domains: InterpretationDomain[]) {
  const labels: Record<InterpretationDomain, string> = {
    weather: 'Wetterlage',
    fusion: 'Fusion',
    scenario: 'Szenarien',
    climate: 'Klima',
    evidence: 'Evidence',
    quality: 'Datenqualität',
  }
  return domains.map((domain) => labels[domain]).join(' · ')
}
