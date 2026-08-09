<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Outlook } from '../types/outlook'

const props = defineProps<{ outlook: Outlook }>()
const selectedDate = ref(props.outlook.fusion?.daily[1]?.date ?? props.outlook.fusion?.daily[0]?.date ?? '')

watch(() => props.outlook.refreshedAt, () => {
  selectedDate.value = props.outlook.fusion?.daily[1]?.date ?? props.outlook.fusion?.daily[0]?.date ?? ''
})

const fusionDays = computed(() => props.outlook.fusion?.daily ?? [])
const champion = computed(() => fusionDays.value.find((day) => day.date === selectedDate.value))
const shadow = computed(() => props.outlook.evidence?.daily.find((day) => day.date === selectedDate.value))
const mosmix = computed(() => props.outlook.challengers?.mosmix?.daily.find((day) => day.date === selectedDate.value))
const fragility = computed(() => props.outlook.fragility?.daily.find((day) => day.date === selectedDate.value))
const fragilityFactors = computed(() => {
  if (!fragility.value) return []
  return (Object.entries(fragility.value.factors) as Array<[keyof typeof driverLabels, number]>)
    .map(([key, factor]) => ({ key, label: driverLabels[key], factor }))
})
const gate = computed(() => props.outlook.calibration?.evidence?.gate ?? props.outlook.evidence?.gate)

const metricRows = computed(() => {
  const bucket = shadow.value?.leadBucket ?? 'days-0-3'
  const metrics = props.outlook.calibration?.metricsByBucket?.[bucket] ?? {}
  const weights = props.outlook.calibration?.weightsByBucket?.[bucket]
  const parameters = props.outlook.calibration?.evidence?.parametersByBucket?.[bucket]?.modelParameters ?? {}
  return Object.entries(metrics)
    .map(([modelId, value]) => ({
      modelId,
      ...value,
      weight: weights?.temperature?.[modelId] ?? 1,
      bias: parameters[modelId]?.temperatureBias ?? 0,
      diversity: parameters[modelId]?.diversityPenalty ?? 1,
    }))
    .sort((left, right) => (left.temperatureCrps ?? 999) - (right.temperatureCrps ?? 999))
})

const progress = computed(() => {
  if (!gate.value) return 0
  return Math.min(100, 100 * gate.value.distinctDays / gate.value.minimumDays)
})

const driverLabels = {
  modelSpread: 'Modellstreuung',
  runShift: 'Laufverschiebung',
  horizon: 'Horizont',
  missingModels: 'Modellabdeckung',
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
    .format(new Date(`${date}T12:00:00`))
}

function value(number: number | null | undefined, digits = 1) {
  return Number.isFinite(number) ? Number(number).toFixed(digits) : '—'
}
</script>

<template>
  <section class="evidence-lab" aria-label="ISOBAR Evidence Engine">
    <header class="evidence-head">
      <div>
        <p class="eyebrow">ISOBAR // Evidence Engine</p>
        <h3>Jede Prognose hinterlässt Beweise.</h3>
        <p>Champion, Shadow-Challenger und DWD MOSMIX werden getrennt archiviert. Nur zukünftige, gepaarte Treffer dürfen den Algorithmus verändern.</p>
      </div>
      <div class="reference-badge" :class="outlook.referenceProfile?.status">
        <span>{{ outlook.referenceProfile?.status === 'active' ? 'DWD Messreferenz' : 'Referenz-Fallback' }}</span>
        <strong>{{ outlook.referenceProfile?.station?.name ?? 'Analysis-Proxy' }}</strong>
        <small v-if="outlook.referenceProfile?.station">
          Station {{ outlook.referenceProfile.station.id }} · {{ value(outlook.referenceProfile.station.distanceKm) }} km
        </small>
      </div>
    </header>

    <div class="date-rail" aria-label="Tag für Forecast-Autopsie">
      <button
        v-for="day in fusionDays"
        :key="day.date"
        type="button"
        :class="{ active: selectedDate === day.date }"
        @click="selectedDate = day.date"
      >
        {{ shortDate(day.date) }}
      </button>
    </div>

    <div class="autopsy-grid">
      <article class="forecast-card champion">
        <span>01 / Live Champion</span>
        <strong>{{ value(champion?.temperatureP50) }}<small>°C P50</small></strong>
        <p>{{ value(champion?.temperatureP10) }}–{{ value(champion?.temperatureP90) }} °C · {{ champion?.modelCount ?? 0 }} Modelle</p>
        <em>bestimmt die sichtbare Prognose</em>
      </article>
      <article class="forecast-card shadow">
        <span>02 / Evidence Shadow</span>
        <strong>{{ value(shadow?.temperatureP50) }}<small>°C P50</small></strong>
        <p v-if="shadow">Bias-korrigiert · Intervall +{{ value(shadow.conformalExpansion) }} °C</p>
        <p v-else>Noch kein zentraler Shadow-Lauf.</p>
        <em>beobachtet, aber greift nicht ein</em>
      </article>
      <article class="forecast-card mosmix">
        <span>03 / DWD Challenger</span>
        <strong>{{ value(mosmix?.temperatureMean) }}<small>°C Mittel</small></strong>
        <p v-if="mosmix">{{ value(mosmix.temperatureMin) }}–{{ value(mosmix.temperatureMax) }} °C · {{ value(mosmix.precipitationSum) }} mm</p>
        <p v-else>Für diesen Horizont nicht verfügbar.</p>
        <em>stationsoptimierte Außenreferenz</em>
      </article>
      <article class="fragility-card" :class="fragility?.level">
        <div>
          <span>Fragility Index</span>
          <strong>{{ fragility?.score ?? '—' }}<small>/100</small></strong>
        </div>
        <div class="fragility-track"><i :style="{ width: `${fragility?.score ?? 0}%` }"></i></div>
        <p v-if="fragility">Treiber: {{ driverLabels[fragility.primaryDriver] }}. Änderungsanfälligkeit, keine Fehlerwahrscheinlichkeit.</p>
        <p v-else>Wird mit dem nächsten zentralen Lauf berechnet.</p>
      </article>
    </div>

    <div v-if="fragilityFactors.length" class="factor-grid" aria-label="Bestandteile des Fragility Index">
      <article v-for="factor in fragilityFactors" :key="factor.key">
        <div><span>{{ factor.label }}</span><strong>{{ Math.round(factor.factor * 100) }} %</strong></div>
        <i><b :style="{ width: `${factor.factor * 100}%` }"></b></i>
      </article>
    </div>

    <div class="gate-panel">
      <div class="gate-copy">
        <span>Out-of-Sample Gate</span>
        <strong v-if="gate?.status === 'eligible'">Promotion prüfbar</strong>
        <strong v-else-if="gate?.status === 'baseline-retained'">Champion bleibt aktiv</strong>
        <strong v-else>Lernphase · {{ gate?.distinctDays ?? 0 }}/{{ gate?.minimumDays ?? 30 }} Tage</strong>
        <p>Entscheidend ist eine positive untere 95-%-Grenze der gepaarten CRPS-Verbesserung – nicht ein schöner Rücktest.</p>
      </div>
      <div class="gate-meter" :style="{ '--progress': `${progress}%` }">
        <i></i>
        <div><span>0</span><span>30 unabhängige Tage</span></div>
      </div>
      <dl>
        <div><dt>Champion CRPS</dt><dd>{{ value(gate?.baselineCrps, 3) }}</dd></div>
        <div><dt>Shadow CRPS</dt><dd>{{ value(gate?.shadowCrps, 3) }}</dd></div>
        <div><dt>Untere 95-%-Grenze</dt><dd>{{ value(gate?.lowerConfidence95, 3) }}</dd></div>
      </dl>
    </div>

    <div v-if="metricRows.length" class="score-table">
      <div class="score-head"><span>Modell / Horizont {{ shadow?.leadBucket }}</span><span>T-MAE</span><span>CRPS</span><span>Brier ≥1 mm</span><span>Bias</span><span>Diversity</span><span>Gewicht</span></div>
      <div v-for="row in metricRows" :key="row.modelId">
        <strong>{{ row.modelId }}</strong>
        <span>{{ value(row.temperatureMae, 2) }}</span>
        <span>{{ value(row.temperatureCrps, 2) }}</span>
        <span>{{ value(row.brier1mm, 3) }}</span>
        <span>{{ row.bias > 0 ? '+' : '' }}{{ value(row.bias, 2) }}°</span>
        <span>{{ value(row.diversity, 2) }}×</span>
        <span>{{ value(row.weight, 2) }}×</span>
      </div>
    </div>
    <p class="evidence-note">{{ outlook.evidence?.notice ?? 'Die Evidence Engine erscheint vollständig, sobald der neue Collector-Lauf in Firebase veröffentlicht wurde.' }}</p>
  </section>
</template>

<style scoped>
.evidence-lab { margin-top: 1rem; border: 1px solid var(--line); background: radial-gradient(circle at 85% 0, color-mix(in srgb, var(--cyan) 8%, transparent), transparent 30rem), #0d1411; }
.evidence-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2rem; align-items: end; padding: 1.4rem; border-bottom: 1px solid var(--line); }
.evidence-head h3 { margin: .2rem 0 .45rem; font-size: clamp(1.45rem, 3vw, 2.35rem); font-weight: 500; letter-spacing: -.045em; }
.evidence-head p:not(.eyebrow) { max-width: 50rem; margin: 0; color: var(--muted); line-height: 1.55; }
.reference-badge { min-width: 15rem; padding: .8rem 1rem; border: 1px solid var(--line); font-family: var(--mono); }
.reference-badge.active { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.reference-badge span, .reference-badge small { display: block; color: var(--muted); font-size: .58rem; text-transform: uppercase; }
.reference-badge strong { display: block; margin: .35rem 0; font-size: .83rem; }
.date-rail { display: flex; overflow-x: auto; border-bottom: 1px solid var(--line); }
.date-rail button { flex: 0 0 auto; padding: .65rem .8rem; border: 0; border-right: 1px solid var(--line); color: var(--muted); background: transparent; font: .64rem var(--mono); cursor: pointer; }
.date-rail button.active { color: #0b100d; background: var(--accent); }
.autopsy-grid { display: grid; grid-template-columns: repeat(3, 1fr); }
.forecast-card, .fragility-card { min-height: 10.5rem; padding: 1rem; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.forecast-card > span, .fragility-card span { color: var(--muted); font: .58rem var(--mono); letter-spacing: .08em; text-transform: uppercase; }
.forecast-card > strong { display: block; margin: 1.2rem 0 .3rem; font: 400 2rem var(--mono); }
.forecast-card strong small, .fragility-card strong small { margin-left: .35rem; color: var(--muted); font-size: .55rem; }
.forecast-card p, .fragility-card p { margin: 0; color: var(--muted); font-size: .7rem; }
.forecast-card em { display: block; margin-top: .85rem; color: var(--accent); font: normal .56rem var(--mono); text-transform: uppercase; }
.forecast-card.shadow em { color: var(--cyan); }
.forecast-card.mosmix { border-right: 0; }
.forecast-card.mosmix em { color: var(--orange); }
.fragility-card { grid-column: 1 / -1; min-height: auto; border-right: 0; display: grid; grid-template-columns: 12rem 1fr minmax(15rem, .7fr); gap: 1rem; align-items: center; }
.fragility-card > div:first-child { display: flex; align-items: baseline; justify-content: space-between; }
.fragility-card strong { font: 400 1.6rem var(--mono); }
.fragility-track { height: .45rem; background: var(--line); }
.fragility-track i { display: block; height: 100%; background: var(--accent); }
.fragility-card.medium .fragility-track i { background: #f9cc57; }
.fragility-card.high .fragility-track i { background: var(--orange); }
.factor-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid var(--line); }
.factor-grid article { padding: .8rem 1rem; border-right: 1px solid var(--line); }
.factor-grid article:last-child { border-right: 0; }
.factor-grid article div { display: flex; justify-content: space-between; gap: .5rem; color: var(--muted); font: .56rem var(--mono); text-transform: uppercase; }
.factor-grid article strong { color: var(--text); font-weight: 500; }
.factor-grid i { display: block; height: .25rem; margin-top: .55rem; background: var(--line); }
.factor-grid b { display: block; height: 100%; background: var(--cyan); }
.gate-panel { display: grid; grid-template-columns: 1.3fr 1fr .8fr; gap: 1.5rem; padding: 1.2rem; border-bottom: 1px solid var(--line); align-items: center; }
.gate-copy > span { color: var(--cyan); font: .6rem var(--mono); text-transform: uppercase; }
.gate-copy strong { display: block; margin: .3rem 0; }
.gate-copy p, .evidence-note { margin: 0; color: var(--muted); font-size: .7rem; line-height: 1.5; }
.gate-meter { --progress: 0%; }
.gate-meter > i { display: block; width: var(--progress); height: .55rem; background: linear-gradient(90deg, var(--cyan), var(--accent)); }
.gate-meter::before { content: ''; display: block; height: .55rem; margin-bottom: -.55rem; background: var(--line); }
.gate-meter div { display: flex; justify-content: space-between; margin-top: .45rem; color: var(--muted); font: .55rem var(--mono); }
.gate-panel dl { margin: 0; }
.gate-panel dl div { display: flex; justify-content: space-between; padding: .35rem 0; border-bottom: 1px solid var(--line); font: .62rem var(--mono); }
.gate-panel dt { color: var(--muted); }
.gate-panel dd { margin: 0; }
.score-table { overflow-x: auto; }
.score-table > div { min-width: 46rem; display: grid; grid-template-columns: 1.6fr repeat(6, 1fr); gap: .75rem; padding: .6rem 1.2rem; border-bottom: 1px solid var(--line); font: .62rem var(--mono); }
.score-table .score-head { color: var(--muted); font-size: .52rem; text-transform: uppercase; }
.score-table strong { color: var(--text); font-weight: 500; }
.evidence-note { padding: .8rem 1.2rem; }
@media (max-width: 900px) { .factor-grid { grid-template-columns: repeat(2, 1fr); } .evidence-head, .gate-panel { grid-template-columns: 1fr; } .reference-badge { min-width: 0; } .autopsy-grid { grid-template-columns: 1fr; } .forecast-card { border-right: 0; } .fragility-card { grid-column: auto; grid-template-columns: 1fr; } }
</style>
