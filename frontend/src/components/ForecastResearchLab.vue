<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Outlook } from '../types/outlook'

const props = defineProps<{ outlook: Outlook }>()
const selectedDate = ref(props.outlook.fusion?.daily[1]?.date ?? props.outlook.fusion?.daily[0]?.date ?? '')
const selectedWindow = ref(props.outlook.analysis?.scenarios.windows[0]?.id ?? '')

watch(() => props.outlook.refreshedAt, () => {
  selectedDate.value = props.outlook.fusion?.daily[1]?.date ?? props.outlook.fusion?.daily[0]?.date ?? ''
  selectedWindow.value = props.outlook.analysis?.scenarios.windows[0]?.id ?? ''
})

const dates = computed(() => props.outlook.fusion?.daily ?? [])
const uncertainty = computed(() => props.outlook.analysis?.uncertainty.daily.find((day) => day.date === selectedDate.value))
const memory = computed(() => props.outlook.runMemory?.daily.find((day) => day.date === selectedDate.value))
const windows = computed(() => props.outlook.analysis?.scenarios.windows ?? [])
const activeWindow = computed(() => windows.value.find((window) => window.id === selectedWindow.value) ?? windows.value[0])
const challengerDay = computed(() => props.outlook.calibrationChallenger?.daily.find((day) => day.date === selectedDate.value))
const diagnostic = computed(() => {
  const bucket = challengerDay.value?.leadBucket
  return bucket ? props.outlook.calibration?.diagnostics?.buckets[bucket] : undefined
})
const reliability = computed(() => diagnostic.value?.baseline.rain1mm?.reliability.filter((bin) => bin.samples) ?? [])

function shortDate(date: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
    .format(new Date(`${date}T12:00:00`))
}

function value(number: number | null | undefined, digits = 1) {
  return Number.isFinite(number) ? Number(number).toFixed(digits) : '—'
}

function scenarioRange(scenario: NonNullable<typeof activeWindow.value>['scenarios'][number]) {
  const values = scenario.daily.map((day) => day.temperature)
  return `${value(Math.min(...values))}–${value(Math.max(...values))} °C`
}
</script>

<template>
  <section v-if="outlook.analysis" class="research-lab" aria-label="ISOBAR Scenario und Quality Lab">
    <header>
      <div>
        <p class="eyebrow">ISOBAR // Scenario Engine</p>
        <h3>Nicht eine Kurve. Mehrere mögliche Entwicklungen.</h3>
        <p>Kohärente Ensemblepfade, mathematisch zerlegte Unsicherheit und ein unveränderlicher Forecast-Pass.</p>
      </div>
      <div class="quality" :class="outlook.dataQuality?.health">
        <span>Data Quality</span>
        <strong>{{ outlook.dataQuality?.health ?? 'unbekannt' }}</strong>
        <small>{{ outlook.dataQuality?.availableFusionModels ?? 0 }}/{{ outlook.dataQuality?.expectedFusionModels ?? 5 }} Fusionsmodelle</small>
      </div>
    </header>

    <div class="date-rail">
      <button v-for="day in dates" :key="day.date" type="button" :class="{ active: selectedDate === day.date }" @click="selectedDate = day.date">
        {{ shortDate(day.date) }}
      </button>
    </div>

    <div class="variance-grid">
      <article>
        <span>Struktur-Dissens</span>
        <strong>{{ value(uncertainty?.temperature.betweenShare, 0) }}<small>%</small></strong>
        <i><b :style="{ width: `${uncertainty?.temperature.betweenShare ?? 0}%` }"></b></i>
        <p>Unterschiede zwischen Modellmitteln</p>
      </article>
      <article>
        <span>Ensemble-Streuung</span>
        <strong>{{ value(uncertainty?.temperature.withinShare, 0) }}<small>%</small></strong>
        <i><b :style="{ width: `${uncertainty?.temperature.withinShare ?? 0}%` }"></b></i>
        <p>Unsicherheit innerhalb der Modelle</p>
      </article>
      <article>
        <span>Laufgedächtnis</span>
        <strong>{{ memory?.state ?? 'sammelt' }}</strong>
        <p>{{ memory?.runCount ?? outlook.runMemory?.runCount ?? 1 }} Läufe · {{ memory?.flipFlopCount ?? 0 }} Richtungswechsel · Δ {{ value(memory?.latestShift) }} K</p>
      </article>
      <article>
        <span>RADOLAN Fläche</span>
        <strong>{{ outlook.radolanStatus?.status ?? 'sammelt' }}</strong>
        <p>{{ outlook.radolanStatus?.references ?? 0 }} Tagesreferenzen im letzten Lauf</p>
      </article>
    </div>

    <div class="window-tabs">
      <button v-for="window in windows" :key="window.id" type="button" :class="{ active: activeWindow?.id === window.id }" @click="selectedWindow = window.id">
        {{ window.label }} <small>Branching {{ window.branchingScore }}/100</small>
      </button>
    </div>
    <div v-if="activeWindow" class="scenario-grid">
      <article v-for="(scenario, index) in activeWindow.scenarios" :key="scenario.id">
        <span>Pfad {{ String(index + 1).padStart(2, '0') }}</span>
        <strong>{{ value(scenario.modelBalancedShare, 0) }}<small>% modellbalanciert</small></strong>
        <p>{{ scenarioRange(scenario) }} · {{ scenario.modelCount }} Modelle · {{ scenario.memberCount }} Member</p>
        <div class="path-strip">
          <i v-for="day in scenario.daily" :key="day.date" :title="`${shortDate(day.date)} · ${value(day.temperature)} °C`" :style="{ height: `${Math.max(12, Math.min(100, 35 + day.temperature * 1.5))}%` }"></i>
        </div>
        <footer>Rohmember {{ value(scenario.rawMemberShare, 0) }} % · {{ Object.keys(scenario.modelComposition).join(' · ') }}</footer>
      </article>
    </div>

    <div class="evidence-row">
      <article>
        <span>Probabilistische Diagnose</span>
        <strong>{{ diagnostic?.distinctDays ?? 0 }} unabhängige Tage</strong>
        <p>80-%-Abdeckung {{ value(diagnostic?.baseline.temperature.intervalCoverage80, 0) }} % · CRPS {{ value(diagnostic?.baseline.temperature.meanCrps, 3) }} · CRPSS Klima {{ value(diagnostic?.baseline.temperature.crpsSkillClimatology, 3) }}</p>
        <div v-if="reliability.length" class="reliability">
          <i v-for="bin in reliability" :key="bin.lower" :title="`${value(bin.meanForecast, 2)} vorhergesagt / ${value(bin.observedFrequency, 2)} beobachtet`" :style="{ height: `${100 * (bin.observedFrequency ?? 0)}%` }"></i>
        </div>
      </article>
      <article>
        <span>EMOS-lite / Quantile Mapping</span>
        <strong>{{ outlook.calibrationChallenger?.status ?? 'prepared' }}</strong>
        <p>{{ challengerDay?.parameterStatus ?? 'sammelt Parameter' }} · niemals automatische Promotion</p>
      </article>
      <article class="passport">
        <span>Forecast Passport</span>
        <strong>{{ outlook.forecastPassport?.id?.slice(0, 12) ?? 'nächster Lauf' }}</strong>
        <p>{{ outlook.forecastPassport?.modelIds.length ?? 0 }} Quellen · {{ outlook.forecastPassport?.algorithmVersion ?? 'noch nicht publiziert' }}</p>
      </article>
    </div>
    <p class="method-note">Szenarioanteile und Varianzkomponenten beschreiben die aktuelle Modellverteilung. Kalibrierte Trefferwahrscheinlichkeiten entstehen erst aus zukünftiger Verifikation.</p>
  </section>
</template>

<style scoped>
.research-lab { margin-top: 1rem; border: 1px solid var(--line); background: radial-gradient(circle at 5% 0, color-mix(in srgb, var(--orange) 8%, transparent), transparent 28rem), #0d1215; }
header { display: grid; grid-template-columns: 1fr auto; gap: 2rem; padding: 1.4rem; align-items: end; border-bottom: 1px solid var(--line); }
header h3 { margin: .2rem 0 .45rem; font-size: clamp(1.45rem, 3vw, 2.35rem); font-weight: 500; letter-spacing: -.045em; }
header p:not(.eyebrow), .variance-grid p, .scenario-grid p, .evidence-row p, .method-note { margin: 0; color: var(--muted); font-size: .7rem; line-height: 1.5; }
.quality { min-width: 12rem; padding: .8rem 1rem; border: 1px solid var(--line); font-family: var(--mono); }
.quality.healthy { border-color: var(--accent); }.quality.degraded { border-color: #f9cc57; }.quality.critical { border-color: var(--orange); }
.quality span, .quality small, article > span { display: block; color: var(--muted); font: .56rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
.quality strong { display: block; margin: .3rem 0; text-transform: uppercase; }
.date-rail { display: flex; overflow-x: auto; border-bottom: 1px solid var(--line); }
.date-rail button, .window-tabs button { padding: .62rem .78rem; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); font: .62rem var(--mono); cursor: pointer; }
.date-rail button.active, .window-tabs button.active { background: var(--accent); color: #08100c; }
.variance-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid var(--line); }
.variance-grid article, .evidence-row article { padding: 1rem; border-right: 1px solid var(--line); }
.variance-grid article:last-child, .evidence-row article:last-child { border-right: 0; }
.variance-grid strong { display: block; margin: .7rem 0 .45rem; font: 400 1.4rem var(--mono); text-transform: capitalize; }
.variance-grid strong small, .scenario-grid strong small { margin-left: .25rem; color: var(--muted); font-size: .55rem; }
.variance-grid article > i { display: block; height: .25rem; margin-bottom: .5rem; background: var(--line); }
.variance-grid article > i b { display: block; height: 100%; background: var(--cyan); }
.window-tabs { display: flex; border-bottom: 1px solid var(--line); }
.window-tabs button { flex: 1; text-align: left; padding: .8rem 1rem; }.window-tabs small { display: block; margin-top: .2rem; }
.scenario-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--line); }
.scenario-grid article { padding: 1rem; border-right: 1px solid var(--line); }.scenario-grid article:last-child { border-right: 0; }
.scenario-grid strong { display: block; margin: .7rem 0 .35rem; font: 400 1.7rem var(--mono); }
.path-strip { height: 4.5rem; display: flex; align-items: end; gap: 2px; margin: .8rem 0; border-bottom: 1px solid var(--line); }
.path-strip i { flex: 1; min-width: 2px; max-height: 100%; background: linear-gradient(var(--orange), var(--cyan)); opacity: .8; }
.scenario-grid footer { color: var(--muted); font: .52rem var(--mono); text-transform: uppercase; }
.evidence-row { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--line); }
.evidence-row strong { display: block; margin: .55rem 0 .3rem; font: 500 1rem var(--mono); }
.passport strong { color: var(--cyan); }.reliability { display: flex; align-items: end; gap: 2px; height: 2.5rem; margin-top: .7rem; }.reliability i { flex: 1; background: var(--accent); min-height: 2px; }
.method-note { padding: .8rem 1.2rem; }
@media (max-width: 850px) { header, .variance-grid, .scenario-grid, .evidence-row { grid-template-columns: 1fr; } .quality { min-width: 0; } .variance-grid article, .scenario-grid article, .evidence-row article { border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
