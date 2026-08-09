import type { Outlook, OutlookModelDay } from '../types/outlook'

export interface InterpretationMetric {
  label: string
  value: string
  detail: string
  helpTitle: string
  helpText: string
  formula?: string
  caution?: string
}

export interface ModelReading {
  id: string
  short: string
  temperatureMin: number
  temperatureMax: number
  precipitation: number
  apparentTemperatureMax: number | null
  relativeHumidityMean: number | null
}

export interface ForecastReading {
  date: string
  mode: 'models' | 'ensemble'
  status: 'robust' | 'mixed' | 'open'
  statusLabel: string
  headline: string
  verdict: string
  scientific: string
  plain: string
  limit: string
  comfort: string
  metrics: InterpretationMetric[]
  modelRows: ModelReading[]
}

function finite(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => Number.isFinite(value))
}

function median(values: Array<number | null | undefined>) {
  const sorted = finite(values).sort((left, right) => left - right)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function range(values: Array<number | null | undefined>) {
  const usable = finite(values)
  return usable.length ? Math.max(...usable) - Math.min(...usable) : null
}

function value(number: number | null | undefined, digits = 1) {
  return Number.isFinite(number) ? Number(number).toFixed(digits) : '\u2014'
}

function percent(number: number | null | undefined) {
  return Number.isFinite(number) ? Math.round(Number(number)) + ' %' : '\u2014'
}

function signed(number: number | null | undefined) {
  if (!Number.isFinite(number)) return '\u2014'
  const rounded = Number(number).toFixed(1)
  return Number(number) > 0 ? '+' + rounded : rounded
}

function dateIndex(outlook: Outlook, date: string) {
  const dates = outlook.mode === 'models'
    ? [...new Set((outlook.models ?? []).flatMap((model) => model.daily.map((day) => day.date)))].sort()
    : outlook.fusion?.daily.map((day) => day.date) ?? []
  return Math.max(0, dates.indexOf(date))
}

function horizonText(index: number) {
  if (index <= 2) return 'Nahbereich'
  if (index <= 6) return 'Kurzfrist'
  if (index <= 14) return 'Mittelfrist'
  return 'erweiterter Horizont'
}

function comfortReading(
  temperature: number | null,
  apparentTemperature: number | null,
  humidity: number | null,
  dewPoint: number | null,
  windSpeed: number | null,
) {
  if (apparentTemperature === null) {
    return 'F\u00fcr eine seri\u00f6se Komfortaussage fehlen in diesem Lauf Gef\u00fchlstemperaturdaten.'
  }

  const difference = temperature === null ? null : apparentTemperature - temperature
  let feel = 'Die modellierte Gef\u00fchlstemperatur liegt nahe an der Lufttemperatur.'
  if (difference !== null && difference >= 2) {
    feel = 'Die modellierte Gef\u00fchlstemperatur liegt ' + value(difference) + ' K h\u00f6her als die Lufttemperatur.'
  } else if (difference !== null && difference <= -2) {
    feel = 'Die modellierte Gef\u00fchlstemperatur liegt ' + value(Math.abs(difference)) + ' K niedriger als die Lufttemperatur.'
  }

  let moisture = ''
  if (humidity !== null && dewPoint !== null) {
    if (humidity < 45 && dewPoint < 14) {
      moisture = ' Das Tagesprofil ist eher trocken'
    } else if (humidity > 65 || dewPoint >= 18) {
      moisture = ' Das Tagesprofil ist eher feucht'
    } else {
      moisture = ' Das Feuchteprofil liegt im mittleren Bereich'
    }
    moisture += ' (RH ' + value(humidity, 0) + ' %, Taupunkt ' + value(dewPoint) + ' \u00b0C).'
  }

  const wind = windSpeed === null ? '' : ' Modellwind im Tagesmittel: ' + value(windSpeed) + ' km/h.'
  return feel + moisture + wind
}

function selectedModelDays(outlook: Outlook, date: string) {
  return (outlook.models ?? []).flatMap((model) => {
    const day = model.daily.find((candidate) => candidate.date === date)
    return day ? [{ model, day }] : []
  })
}

function rainVoteText(wetCount: number, modelCount: number) {
  if (!modelCount) return 'Kein Regenvergleich verf\u00fcgbar.'
  if (wetCount === 0) return 'Keiner der Einzell\u00e4ufe berechnet mindestens 1 mm Niederschlag.'
  if (wetCount === modelCount) return 'Alle Einzell\u00e4ufe berechnen mindestens 1 mm Niederschlag.'
  return wetCount + ' von ' + modelCount + ' Einzell\u00e4ufen berechnen mindestens 1 mm Niederschlag.'
}

export function buildDeterministicReading(outlook: Outlook, date: string): ForecastReading | null {
  const selected = selectedModelDays(outlook, date)
  if (!selected.length) return null

  const days = selected.map((entry) => entry.day)
  const temperatureMin = median(days.map((day) => day.temperatureMin))
  const temperatureMax = median(days.map((day) => day.temperatureMax))
  const minSpread = range(days.map((day) => day.temperatureMin)) ?? 0
  const maxSpread = range(days.map((day) => day.temperatureMax)) ?? 0
  const temperatureSpread = Math.max(minSpread, maxSpread)
  const precipitationMedian = median(days.map((day) => day.precipitation)) ?? 0
  const wetCount = days.filter((day) => day.precipitation >= 1).length
  const modelCount = days.length
  const leadIndex = dateIndex(outlook, date)

  const rainSplit = wetCount > 0 && wetCount < modelCount
  const rainConflict = rainSplit
    ? (Math.abs(wetCount / modelCount - 0.5) <= 0.15 ? 2 : 1)
    : 0
  const temperatureConflict = temperatureSpread >= 4 ? 2 : temperatureSpread >= 2 ? 1 : 0
  const horizonPressure = leadIndex >= 10 ? 2 : leadIndex >= 5 ? 1 : 0
  const missingPressure = modelCount < (outlook.models?.length ?? modelCount) ? 1 : 0
  const conflictPoints = temperatureConflict + rainConflict + horizonPressure + missingPressure
  const status = conflictPoints <= 1 ? 'robust' : conflictPoints <= 3 ? 'mixed' : 'open'
  const statusLabel = status === 'robust'
    ? 'Modelle eng beieinander'
    : status === 'mixed'
      ? 'Gemischtes Modellsignal'
      : 'Entwicklung noch offen'

  const apparentTemperature = median(days.map((day) => day.apparentTemperatureMax))
  const humidity = median(days.map((day) => day.relativeHumidityMean))
  const dewPoint = median(days.map((day) => day.dewPointMean))
  const windSpeed = median(days.map((day) => day.windSpeedMean))
  const comfort = comfortReading(temperatureMax, apparentTemperature, humidity, dewPoint, windSpeed)
  const rainVote = rainVoteText(wetCount, modelCount)

  const spreadPlain = temperatureSpread < 2
    ? 'Die Temperaturkurven liegen eng zusammen.'
    : temperatureSpread < 4
      ? 'Die Temperaturkurven unterscheiden sich sichtbar, aber noch nicht grunds\u00e4tzlich.'
      : 'Die Modelle zeichnen deutlich verschiedene Temperaturentwicklungen.'

  return {
    date,
    mode: 'models',
    status,
    statusLabel,
    headline: value(temperatureMin) + '\u2013' + value(temperatureMax) + ' \u00b0C im Modellzentrum \u00b7 ' + value(precipitationMedian) + ' mm Median',
    verdict: horizonText(leadIndex) + ': ' + rainVote + ' ' + spreadPlain,
    scientific: 'Vier deterministische Modelll\u00e4ufe werden taggleich verglichen. Die angezeigte Temperaturspanne ist der Abstand zwischen dem niedrigsten und h\u00f6chsten Modellwert; das Regenvotum z\u00e4hlt Modelle, nicht Ensemble-Member.',
    plain: statusLabel + '. ' + spreadPlain + ' ' + rainVote,
    limit: 'Modell\u00fcbereinstimmung ist keine Trefferwahrscheinlichkeit. Besonders ab Tag 8 k\u00f6nnen alle Modelle gemeinsam in dieselbe falsche Richtung laufen.',
    comfort,
    metrics: [
      {
        label: 'Modellzentrum',
        value: value(temperatureMin) + '\u2013' + value(temperatureMax) + ' \u00b0C',
        detail: 'Median aus ' + modelCount + ' Einzell\u00e4ufen',
        helpTitle: 'Was ist das Modellzentrum?',
        helpText: 'F\u00fcr Tagesminimum und Tagesmaximum wird jeweils der Median der verf\u00fcgbaren Modelle verwendet. Ein einzelner Ausrei\u00dfer zieht den Wert dadurch weniger stark.',
        formula: 'P50(ICON, IFS, AIFS, GFS)',
      },
      {
        label: 'Modellstreuung',
        value: value(temperatureSpread) + ' K',
        detail: 'gr\u00f6\u00dfte Tages-Spanne',
        helpTitle: 'Was bedeutet Modellstreuung?',
        helpText: 'Sie misst, wie weit der hoechste und niedrigste Einzellauf auseinanderliegen. Gro\u00dfe Streuung bedeutet mehrere unterschiedliche Modelll\u00f6sungen, nicht automatisch einen Fehler dieser Gr\u00f6\u00dfe.',
        formula: 'max(Modellwert) \u2212 min(Modellwert)',
        caution: 'Keine Fehlerwahrscheinlichkeit.',
      },
      {
        label: 'Regenvotum',
        value: wetCount + ' / ' + modelCount,
        detail: '\u2265 1 mm \u00b7 Median ' + value(precipitationMedian) + ' mm',
        helpTitle: 'Ist das eine Regenwahrscheinlichkeit?',
        helpText: 'Nein. Jeder deterministische Lauf gibt genau eine L\u00f6sung ab. Das Votum zeigt nur, wie viele Modelle mindestens 1 mm berechnen.',
        caution: 'Modellvotum, nicht kalibrierte Wahrscheinlichkeit.',
      },
      {
        label: 'Gef\u00fchltes Maximum',
        value: apparentTemperature === null ? '\u2014' : value(apparentTemperature) + ' \u00b0C',
        detail: humidity === null ? 'Zusatzdaten fehlen' : 'RH Tagesmittel ' + value(humidity, 0) + ' %',
        helpTitle: 'Wie wird das Hitzegef\u00fchl gelesen?',
        helpText: 'Die Gef\u00fchlstemperatur kombiniert Lufttemperatur, relative Feuchte, Wind und Strahlung. ISOBAR vergleicht sie mit der Lufttemperatur und nennt die Feuchte separat.',
        caution: 'Modellierte Komfortgr\u00f6\u00dfe, keine medizinische Belastungswarnung.',
      },
    ],
    modelRows: selected.map(({ model, day }) => ({
      id: model.id,
      short: model.short,
      temperatureMin: day.temperatureMin,
      temperatureMax: day.temperatureMax,
      precipitation: day.precipitation,
      apparentTemperatureMax: day.apparentTemperatureMax ?? null,
      relativeHumidityMean: day.relativeHumidityMean ?? null,
    })),
  }
}

function memoryExplanation(outlook: Outlook, date: string) {
  const memory = outlook.runMemory?.daily.find((day) => day.date === date)
  if (!memory) {
    return {
      value: 'sammelt',
      detail: 'Noch zu wenige archivierte L\u00e4ufe.',
      technical: 'F\u00fcr diesen Tag liegen noch nicht mindestens zwei vergleichbare P50-L\u00e4ufe vor.',
    }
  }

  const shiftDirection = memory.latestShift > 0 ? 'w\u00e4rmer' : memory.latestShift < 0 ? 'k\u00fchler' : 'unver\u00e4ndert'
  if (memory.state === 'converging') {
    return {
      value: 'converging',
      detail: signed(memory.latestShift) + ' K \u00b7 ' + memory.runCount + ' L\u00e4ufe',
      technical: 'Der j\u00fcngste absolute P50-Sprung ist mindestens 20 % kleiner als die zuvor typischen Lauf\u00e4nderungen. Der letzte Lauf wurde ' + shiftDirection + '.',
    }
  }
  if (memory.state === 'diverging') {
    return {
      value: 'diverging',
      detail: signed(memory.latestShift) + ' K \u00b7 ' + memory.runCount + ' L\u00e4ufe',
      technical: 'Der j\u00fcngste absolute P50-Sprung ist mindestens 20 % gr\u00f6\u00dfer als die zuvor typischen Lauf\u00e4nderungen. Der letzte Lauf wurde ' + shiftDirection + '.',
    }
  }
  return {
    value: 'stable',
    detail: signed(memory.latestShift) + ' K \u00b7 ' + memory.runCount + ' L\u00e4ufe',
    technical: 'Der j\u00fcngste P50-Sprung liegt innerhalb von \u00b120 % der zuvor typischen Lauf\u00e4nderung. Das hei\u00dft weder sicher noch unver\u00e4ndert; nur kein klares Konvergenz- oder Divergenzsignal.',
  }
}

export function buildFusionReading(outlook: Outlook, date: string): ForecastReading | null {
  const fusionDays = outlook.fusion?.daily ?? []
  const day = fusionDays.find((candidate) => candidate.date === date)
  if (!day) return null

  const index = fusionDays.findIndex((candidate) => candidate.date === date)
  const previous = index > 0 ? fusionDays[index - 1] : null
  const trend = previous ? day.temperatureP50 - previous.temperatureP50 : 0
  const uncertainty = outlook.analysis?.uncertainty.daily.find((candidate) => candidate.date === date)
  const standardDeviation = uncertainty ? Math.sqrt(uncertainty.temperature.totalVariance) : null
  const memory = memoryExplanation(outlook, date)
  const fragility = outlook.fragility?.daily.find((candidate) => candidate.date === date)
  const scenarioWindow = outlook.analysis?.scenarios.windows.find((window) => window.dates.includes(date))
  const leadingScenario = scenarioWindow?.scenarios[0]
  const scenarioTechnical = scenarioWindow && leadingScenario
    ? ' Im Fenster ' + scenarioWindow.label + ' tr\u00e4gt der gr\u00f6\u00dfte zusammenh\u00e4ngende Pfad ' + value(leadingScenario.modelBalancedShare, 0) + ' % der modellbalancierten Rohmasse; Branching ' + scenarioWindow.branchingScore + '/100.'
    : ''
  const scenarioPlain = scenarioWindow
    ? scenarioWindow.branchingScore >= 60
      ? 'Die Scenario Engine sieht deutlich getrennte m\u00f6gliche Entwicklungen.'
      : scenarioWindow.branchingScore >= 30
        ? 'Die Scenario Engine erkennt mehrere unterscheidbare Entwicklungswege.'
        : 'Die Scenario-Pfade liegen f\u00fcr dieses Zeitfenster vergleichsweise nah beieinander.'
    : 'Die Scenario Engine sammelt f\u00fcr diesen Tag noch keinen vollst\u00e4ndigen Pfad.'

  const status = fragility?.level === 'high'
    ? 'open'
    : fragility?.level === 'medium'
      ? 'mixed'
      : 'robust'
  const statusLabel = fragility
    ? (fragility.level === 'high' ? 'Hohe \u00c4nderungsanf\u00e4lligkeit' : fragility.level === 'medium' ? 'Mittlere \u00c4nderungsanf\u00e4lligkeit' : 'Niedrige \u00c4nderungsanf\u00e4lligkeit')
    : 'Fragility sammelt'

  const trendText = Math.abs(trend) < 0.8
    ? 'gegen\u00fcber dem Vortag wenig Temperatur\u00e4nderung'
    : trend > 0
      ? 'gegen\u00fcber dem Vortag etwa ' + value(trend) + ' K w\u00e4rmer'
      : 'gegen\u00fcber dem Vortag etwa ' + value(Math.abs(trend)) + ' K k\u00fchler'
  const rainText = day.rainProbability1mm >= 70
    ? 'Das rohe Ensemblesignal ist deutlich nass.'
    : day.rainProbability1mm >= 40
      ? 'Das Ensemblesignal f\u00fcr Niederschlag ist geteilt bis erh\u00f6ht.'
      : day.rainProbability1mm <= 20
        ? 'Die gro\u00dfe Mehrheit der modellbalancierten Member bleibt unter 1 mm.'
        : 'Ein schwaches Niederschlagssignal ist vorhanden.'

  const spreadText = standardDeviation === null
    ? 'Die absolute Gesamtstreuung ist noch nicht publiziert.'
    : standardDeviation < 0.8
      ? 'Die Temperaturpfade liegen f\u00fcr diesen Tag relativ eng.'
      : standardDeviation < 1.8
        ? 'Die Temperaturpfade zeigen eine sichtbare Bandbreite.'
        : 'Die Temperaturpfade liegen deutlich auseinander; die konkrete Auspr\u00e4gung kann sich noch stark verschieben.'

  const comfort = comfortReading(
    day.temperatureP50,
    day.apparentTemperatureP50 ?? null,
    day.relativeHumidityP50 ?? null,
    day.dewPointP50 ?? null,
    day.windSpeedP50 ?? null,
  )

  const withinShare = uncertainty?.temperature.withinShare
  const betweenShare = uncertainty?.temperature.betweenShare
  const scientific = uncertainty
    ? percent(withinShare) + ' der aktuell berechneten Temperaturvarianz liegen innerhalb der einzelnen Ensembles, ' + percent(betweenShare) + ' zwischen den Modellmitteln. Die Wurzel der Gesamtvarianz betr\u00e4gt ' + value(standardDeviation) + ' K.'
    : 'Die Varianzzerlegung wird mit dem n\u00e4chsten zentralen Collector-Lauf f\u00fcr diesen Tag erg\u00e4nzt.'

  return {
    date,
    mode: 'ensemble',
    status,
    statusLabel,
    headline: value(day.temperatureP50) + ' \u00b0C P50 \u00b7 ' + value(day.temperatureP10) + '\u2013' + value(day.temperatureP90) + ' \u00b0C P10\u2013P90',
    verdict: rainText + ' Es wird ' + trendText + '.',
    scientific: scientific + scenarioTechnical,
    plain: spreadText + ' ' + memory.technical + ' ' + scenarioPlain,
    limit: 'P10\u2013P90, Varianzanteile, Szenarioanteile und Fragility beschreiben die aktuelle Modellverteilung. Nur die separat aufgebaute Verifikation darf daraus sp\u00e4ter kalibrierte Trefferwahrscheinlichkeiten ableiten.',
    comfort,
    metrics: [
      {
        label: 'Temperaturverteilung',
        value: value(day.temperatureP50) + ' \u00b0C',
        detail: 'P10\u2013P90 ' + value(day.temperatureP10) + '\u2013' + value(day.temperatureP90) + ' \u00b0C',
        helpTitle: 'Was sagt P50?',
        helpText: 'P50 ist der modellbalancierte Median. P10 bis P90 enthalten 80 % der aktuell modellierten Verteilung, nicht 80 % aller physikalisch m\u00f6glichen Wetterlagen.',
        caution: 'Rohverteilung; lokale Kalibrierung ist separat ausgewiesen.',
      },
      {
        label: 'Ensemble-Streuung',
        value: percent(withinShare),
        detail: 'Varianzanteil innerhalb der Modelle',
        helpTitle: 'Bedeutet 99 % Streuung: 99 % ungenau?',
        helpText: 'Nein. Der Prozentwert teilt nur die Gesamtvarianz nach ihrer Quelle auf. 99 % hei\u00dft: Fast die gesamte vorhandene Streuung entsteht zwischen Membern desselben Modells; nur etwa 1 % zwischen den Modellmitteln.',
        formula: 'innerhalb-Modell-Varianz / Gesamtvarianz',
        caution: 'Weder Fehlerquote noch Eintrittswahrscheinlichkeit.',
      },
      {
        label: 'Absolute Streuung',
        value: standardDeviation === null ? '\u2014' : value(standardDeviation) + ' K',
        detail: 'Standardabweichung aus Gesamtvarianz',
        helpTitle: 'Warum ist der Kelvinwert zus\u00e4tzlich wichtig?',
        helpText: 'Der Prozentanteil erkl\u00e4rt die Quelle der Streuung. Erst die Standardabweichung zeigt ihre absolute Gr\u00f6\u00dfe. 99 % Anteil kann bei insgesamt kleiner Streuung trotzdem ein enges Signal sein.',
        formula: '\u221a(innerhalb-Varianz + zwischen-Varianz)',
      },
      {
        label: 'Laufged\u00e4chtnis',
        value: memory.value,
        detail: memory.detail,
        helpTitle: 'Was bedeutet stable?',
        helpText: memory.technical,
        caution: 'Stabilit\u00e4t zwischen Modelll\u00e4ufen, keine Vorhersagegarantie.',
      },
      {
        label: 'Scenario Engine',
        value: leadingScenario ? value(leadingScenario.modelBalancedShare, 0) + ' %' : 'sammelt',
        detail: scenarioWindow ? scenarioWindow.label + ' / Branching ' + scenarioWindow.branchingScore + '/100' : 'kein komplettes Fenster',
        helpTitle: 'Ist der Szenarioanteil eine Eintrittswahrscheinlichkeit?',
        helpText: 'Nein. Der Anteil ist die modellbalancierte Rohmasse zeitlich zusammenh\u00e4ngender Ensemblepfade. Branching beschreibt, wie klar sich die Pfade im Merkmalsraum trennen.',
        caution: 'Rohes Szenariogewicht, noch nicht historisch kalibriert.',
      },
    ],
    modelRows: [],
  }
}
