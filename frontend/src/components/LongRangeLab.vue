<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { getOutlook } from '../api/outlook'
import type { ChartSeries } from '../types/chart'
import type { FusionDay, Outlook, OutlookModelDay, OutlookView } from '../types/outlook'
import LongRangeChart from './LongRangeChart.vue'
import CalibrationStatusCard from './CalibrationStatus.vue'

const props = defineProps<{ latitude: number; longitude: number }>()

type ModelMetric = 'temperatureMax' | 'temperatureMin' | 'precipitation'
type EnsembleMetric = 'temperature' | 'precipitation'

const view = ref<OutlookView | null>(null)
const modelMetric = ref<ModelMetric>('temperatureMax')
const ensembleMetric = ref<EnsembleMetric>('temperature')
const showSources = ref(false)
const loading = ref(false)
const error = ref('')
const results = reactive<Partial<Record<OutlookView, Outlook>>>({})
let request: AbortController | null = null

const data = computed(() => (view.value ? results[view.value] : undefined))
const modelColors = ['var(--model-icon)', 'var(--model-ifs)', 'var(--text)', 'var(--model-gfs)']
const ensembleColors = ['var(--model-icon)', 'var(--model-ifs)', 'var(--text)', 'var(--model-gfs)', 'var(--cyan)', 'var(--orange)']

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const dates = computed(() => {
  if (data.value?.mode === 'ensemble' && data.value.fusion?.daily.length) {
    return data.value.fusion.daily.map((day) => day.date)
  }
  const groups = data.value?.mode === 'models'
    ? data.value.models
    : data.value?.ensembles
  return [...(groups ?? [])].sort((a, b) => b.daily.length - a.daily.length)[0]?.daily.map((day) => day.date) ?? []
})

const unit = computed(() =>
  (data.value?.mode === 'models' && modelMetric.value !== 'precipitation') ||
  (data.value?.mode === 'ensemble' && ensembleMetric.value === 'temperature')
    ? '°C'
    : 'mm',
)

const chartSeries = computed<ChartSeries[]>(() => {
  if (!data.value) return []
  if (data.value.mode === 'ensemble') {
    const fusion = data.value.fusion
    const fusionSeries: ChartSeries[] = fusion ? [{
      id: 'isobar-fusion',
      label: fusion.method === 'skill-weighted-empirical'
        ? 'ISOBAR Fusion · skill-gewichtet'
        : 'ISOBAR Fusion · modellbalanciert',
      color: 'var(--accent)',
      emphasized: true,
      values: fusion.daily.map((day) =>
        ensembleMetric.value === 'temperature' ? day.temperatureP50 : day.precipitationP50,
      ),
      lower: fusion.daily.map((day) =>
        ensembleMetric.value === 'temperature' ? day.temperatureP10 : day.precipitationP10,
      ),
      upper: fusion.daily.map((day) =>
        ensembleMetric.value === 'temperature' ? day.temperatureP90 : day.precipitationP90,
      ),
      ...(ensembleMetric.value === 'temperature' ? {
        innerLower: fusion.daily.map((day) => day.temperatureP25),
        innerUpper: fusion.daily.map((day) => day.temperatureP75),
      } : {}),
      pointDetails: fusion.daily.map((day) =>
        `${day.modelCount} ${day.modelCount === 1 ? 'Modell' : 'Modelle'} · ${day.memberCount} Mitglieder`,
      ),
    }] : []
    const visibleModels = (data.value.ensembles ?? []).filter((model) =>
      !fusion || showSources.value || model.id === 'ec46',
    )
    const sourceSeries = visibleModels.map<ChartSeries>((model, index) => {
      const byDate = new Map(model.daily.map((day) => [day.date, day]))
      return {
        id: model.id,
        label: `${model.short} · ${model.memberCount} Mitglieder`,
        color: model.id === 'ec46' ? 'var(--model-gfs)' : ensembleColors[index % ensembleColors.length],
        secondary: true,
        values: dates.value.map((date) => {
          const day = byDate.get(date)
          if (!day) return null
          return ensembleMetric.value === 'temperature'
            ? day.temperatureMedian
            : day.precipitationMedian
        }),
      }
    })
    return [...fusionSeries, ...sourceSeries]
  }

  const models = data.value.models ?? []
  const valueOf = (day: OutlookModelDay) => day[modelMetric.value]
  const series: ChartSeries[] = models.map((model, index) => ({
    id: model.id,
    label: `${model.short} · ${model.horizonDays} Tage`,
    color: modelColors[index % modelColors.length],
    values: model.daily.map(valueOf),
  }))
  const dailyValues = dates.value.map((_, dayIndex) =>
    models
      .map((model) => model.daily[dayIndex])
      .filter((day): day is OutlookModelDay => Boolean(day))
      .map(valueOf),
  )
  series.unshift({
    id: 'model-median',
    label: 'Modellmedian + Spanne',
    color: 'var(--accent)',
    emphasized: true,
    values: dailyValues.map((values) => values.length ? median(values) : null),
    lower: dailyValues.map((values) => values.length ? Math.min(...values) : null),
    upper: dailyValues.map((values) => values.length ? Math.max(...values) : null),
  })
  return series
})

const fusionDays = computed(() =>
  data.value?.mode === 'ensemble' ? data.value.fusion?.daily ?? [] : [],
)

const signalDay = computed<FusionDay | undefined>(() => fusionDays.value[1] ?? fusionDays.value[0])

const horizonStages = computed(() => {
  const days = fusionDays.value
  const stages = [
    { label: 'Nahbereich', range: 'Tag 1–5', index: Math.min(4, days.length - 1) },
    { label: 'Mittelfrist', range: 'Tag 6–15', index: Math.min(14, days.length - 1) },
    { label: 'Erweitert', range: 'Tag 16–30', index: Math.min(29, days.length - 1) },
  ]
  return stages.flatMap((stage) => {
    const day = days[stage.index]
    return day ? [{ ...stage, day }] : []
  })
})

function shortDate(date: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${date}T12:00:00`))
}

function probability(value: number) {
  return `${Math.round(value)} %`
}

function runTimestamp(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function selectView(selected: OutlookView) {
  view.value = selected
  error.value = ''
  if (results[selected]) return
  request?.abort()
  request = new AbortController()
  loading.value = true
  try {
    results[selected] = await getOutlook(selected, props.latitude, props.longitude, request.signal)
  } catch (cause) {
    if ((cause as Error).name !== 'AbortError') {
      error.value = cause instanceof Error ? cause.message : 'Langfristmodelle konnten nicht geladen werden.'
    }
  } finally {
    loading.value = false
  }
}

watch(() => [props.latitude, props.longitude], () => {
  request?.abort()
  delete results['16']
  delete results['30']
  view.value = null
  error.value = ''
})
onBeforeUnmount(() => request?.abort())
</script>

<template>
  <section class="long-range panel">
    <header>
      <div>
        <p class="eyebrow">ISOBAR // Probabilistic Lab</p>
        <h2>Vom Modellrauschen zum Signal.</h2>
        <p>Fusionierte Ensembles, sichtbare Unsicherheit und eine Datenbasis, die mit jedem Prognosetag transparent kleiner wird.</p>
      </div>
      <nav aria-label="Prognosezeitraum">
        <button type="button" :class="{ active: view === '16' }" @click="selectView('16')">
          16 Tage <small>Einzelläufe</small>
        </button>
        <button type="button" :class="{ active: view === '30' }" @click="selectView('30')">
          30 Tage <small>ISOBAR Fusion</small>
        </button>
      </nav>
    </header>

    <div v-if="!view" class="intro">
      <strong>Wähle eine Reichweite.</strong>
      <p>Die großen Datensätze werden erst dann geladen. So bleibt die normale Wetteransicht schnell.</p>
    </div>
    <div v-else-if="loading" class="status">Modelle werden abgefragt und statistisch verdichtet …</div>
    <div v-else-if="error" class="status error">
      <span>{{ error }}</span>
      <button type="button" @click="selectView(view)">Erneut laden</button>
    </div>

    <template v-else-if="data">
      <div class="toolbar">
        <div v-if="data.mode === 'models'" class="metrics">
          <button type="button" :class="{ active: modelMetric === 'temperatureMax' }" @click="modelMetric = 'temperatureMax'">Tageshoch</button>
          <button type="button" :class="{ active: modelMetric === 'temperatureMin' }" @click="modelMetric = 'temperatureMin'">Tagestief</button>
          <button type="button" :class="{ active: modelMetric === 'precipitation' }" @click="modelMetric = 'precipitation'">Regen</button>
        </div>
        <div v-else class="metrics">
          <button type="button" :class="{ active: ensembleMetric === 'temperature' }" @click="ensembleMetric = 'temperature'">Temperatur</button>
          <button type="button" :class="{ active: ensembleMetric === 'precipitation' }" @click="ensembleMetric = 'precipitation'">Regen</button>
        </div>
        <div class="toolbar-actions">
          <button
            v-if="data.mode === 'ensemble' && data.fusion"
            type="button"
            class="source-toggle"
            :aria-pressed="showSources"
            @click="showSources = !showSources"
          >
            {{ showSources ? 'Quellmodelle ausblenden' : 'Quellmodelle einblenden' }}
          </button>
          <span>
            {{ data.source === 'firebase'
              ? 'Gespeicherter Lauf · '
              : data.source === 'cache'
                ? 'Browser-Cache · '
                : data.source === 'stale'
                  ? 'Älterer Lauf · '
                  : '' }}Open-Meteo
          </span>
        </div>
      </div>

      <section v-if="data.mode === 'ensemble' && data.fusion" class="fusion-console" aria-label="ISOBAR Fusion Status">
        <div class="console-head">
          <div>
            <span class="live-indicator"><i></i>Fusion aktiv</span>
            <strong>{{ data.fusion.method === 'skill-weighted-empirical'
              ? 'Historically verified skill weights'
              : 'Equal-model weighted empirical' }}</strong>
          </div>
          <small>EC46 separat · keine Scheingenauigkeit</small>
        </div>

        <div class="horizon-rail" aria-label="Modellabdeckung nach Prognosehorizont">
          <article v-for="stage in horizonStages" :key="stage.label">
            <span>{{ stage.range }}</span>
            <strong>{{ stage.label }}</strong>
            <small>
              {{ stage.day.modelCount }}
              {{ stage.day.modelCount === 1 ? 'Modell' : 'Modelle' }}
              · {{ stage.day.memberCount }} Mitglieder
            </small>
          </article>
        </div>

        <div v-if="signalDay" class="signal-strip">
          <article>
            <span>P50 Temperatur · {{ shortDate(signalDay.date) }}</span>
            <strong>{{ signalDay.temperatureP50.toFixed(1) }}<small>°C</small></strong>
            <p>{{ data.fusion.method === 'skill-weighted-empirical'
              ? 'historisch skill-gewichtet'
              : 'modellbalancierter Median' }}</p>
          </article>
          <article>
            <span>80-%-Korridor</span>
            <strong>{{ signalDay.temperatureP10.toFixed(1) }}–{{ signalDay.temperatureP90.toFixed(1) }}<small>°C</small></strong>
            <p>P10 bis P90</p>
          </article>
          <article>
            <span>Rohsignal · Regen ≥ 1 mm</span>
            <strong>{{ probability(signalDay.rainProbability1mm) }}</strong>
            <p>{{ data.fusion.method === 'skill-weighted-empirical'
              ? 'historisch skill-gewichtet'
              : 'modellbalanciert' }}</p>
          </article>
          <article>
            <span>Rohsignal · Regen ≥ 10 mm</span>
            <strong>{{ probability(signalDay.rainProbability10mm) }}</strong>
            <p>{{ data.fusion.method === 'skill-weighted-empirical'
              ? 'skill-gewichtet · nicht kalibriert'
              : 'nicht historisch kalibriert' }}</p>
          </article>
        </div>
      </section>

      <section
        v-if="data.mode === 'ensemble' && data.runStability"
        class="run-stability"
        aria-label="Vergleich mit dem vorherigen Modelllauf"
      >
        <div>
          <span>Run-to-run / {{ data.runStability.comparedDays }} gemeinsame Tage</span>
          <small>gegen {{ runTimestamp(data.runStability.previousCapturedAt) }} Uhr</small>
        </div>
        <article>
          <span>Mittlere P50-Verschiebung</span>
          <strong>{{ data.runStability.meanAbsoluteTemperatureShift.toFixed(1) }}&deg;C</strong>
        </article>
        <article>
          <span>Maximale P50-Verschiebung</span>
          <strong>{{ data.runStability.maximumAbsoluteTemperatureShift.toFixed(1) }}&deg;C</strong>
        </article>
        <article>
          <span>Regen-Signalverschiebung</span>
          <strong>{{ data.runStability.meanAbsoluteRainShift.toFixed(1) }} Pp</strong>
        </article>
      </section>

      <CalibrationStatusCard
        v-if="data.mode === 'ensemble' && data.calibration"
        :calibration="data.calibration"
      />

      <LongRangeChart
        :dates="dates"
        :series="chartSeries"
        :unit="unit"
        :floor-at-zero="unit === 'mm'"
      />

      <div class="model-cards">
        <article v-for="model in data.models" :key="model.id">
          <span>{{ model.short }}</span><strong>{{ model.horizonDays }} Tage</strong><small>{{ model.name }}</small>
        </article>
        <article v-for="model in data.ensembles" :key="model.id" :class="{ reference: model.id === 'ec46' }">
          <span>{{ model.short }}</span><strong>{{ model.memberCount }} Mitglieder</strong><small>{{ model.name }}</small>
          <em v-if="model.id === 'ec46'">separate Langfrist-Referenz</em>
        </article>
      </div>
      <div class="method-notes">
        <p v-if="data.fusion" class="fusion-notice"><strong>Methodik</strong>{{ data.fusion.notice }}</p>
        <p class="notice">{{ data.notice }}</p>
      </div>
      <p v-for="warning in data.warnings" :key="warning" class="warning">{{ warning }}</p>
    </template>
  </section>
</template>

<style scoped>
.long-range { position: relative; padding: clamp(1.2rem, 3vw, 2.2rem); overflow: hidden; background: radial-gradient(ellipse at 82% 0%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 32rem), var(--surface); }
.long-range::before { content: ''; position: absolute; width: 26rem; height: 11rem; right: -7rem; top: -6rem; border: 1px solid var(--line); border-radius: 50%; box-shadow: 0 0 0 1.5rem color-mix(in srgb, var(--line) 68%, transparent), 0 0 0 3rem color-mix(in srgb, var(--line) 40%, transparent); transform: rotate(-11deg); pointer-events: none; }
header { position: relative; display: flex; justify-content: space-between; gap: 2rem; align-items: end; margin-bottom: 1.5rem; }
header > div { max-width: 48rem; }
header h2 { margin: .2rem 0 .5rem; font-size: clamp(1.8rem, 4vw, 3.35rem); font-weight: 500; letter-spacing: -.055em; line-height: 1; }
header p:not(.eyebrow), .intro p, .notice, .warning { color: var(--muted); max-width: 48rem; line-height: 1.6; }
nav { display: grid; grid-template-columns: repeat(2, minmax(8rem, 1fr)); }
nav button { padding: .8rem 1rem; border: 1px solid var(--line); background: color-mix(in srgb, var(--background) 58%, transparent); color: var(--muted); text-align: left; cursor: pointer; font: 700 1rem var(--mono); transition: background .16s ease, border-color .16s ease, color .16s ease; }
nav button + button { border-left: 0; }
nav button.active { background: var(--accent); color: var(--background); border-color: var(--accent); }
nav small { display: block; margin-top: .2rem; font-size: .62rem; text-transform: uppercase; letter-spacing: .1em; }
.intro, .status { min-height: 12rem; display: grid; place-content: center; text-align: center; border: 1px dashed var(--line-strong); }
.intro strong { font: 600 1.1rem var(--mono); }
.status { color: var(--muted); font: .85rem var(--mono); }
.status.error { color: var(--model-gfs); gap: 1rem; }
.status button { justify-self: center; }
.toolbar { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: .8rem; }
.toolbar-actions { display: flex; align-items: center; gap: .75rem; }
.toolbar-actions > span { color: var(--muted); font: .64rem var(--mono); text-transform: uppercase; }
.metrics { display: flex; flex-wrap: wrap; }
.metrics button, .status button, .source-toggle { border: 1px solid var(--line); background: transparent; color: var(--muted); padding: .5rem .75rem; font: .68rem var(--mono); cursor: pointer; }
.metrics button + button { border-left: 0; }
.metrics button.active, .source-toggle[aria-pressed='true'] { color: var(--text); background: var(--surface-high); border-color: var(--line-strong); }
.fusion-console { position: relative; margin: 0 0 .8rem; border: 1px solid var(--line); background: color-mix(in srgb, var(--background) 48%, transparent); }
.console-head { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--line); }
.console-head > div { display: flex; align-items: center; gap: 1rem; }
.console-head strong, .console-head small { color: var(--muted); font: .62rem var(--mono); letter-spacing: .06em; text-transform: uppercase; }
.live-indicator { display: inline-flex; align-items: center; gap: .5rem; color: var(--accent); font: .65rem var(--mono); letter-spacing: .1em; text-transform: uppercase; }
.live-indicator i { width: .38rem; height: .38rem; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); }
.horizon-rail { display: grid; grid-template-columns: 5fr 10fr 15fr; border-bottom: 1px solid var(--line); }
.horizon-rail article { position: relative; min-width: 0; padding: .8rem 1rem 1rem; border-right: 1px solid var(--line); }
.horizon-rail article:last-child { border-right: 0; }
.horizon-rail article::after { content: ''; position: absolute; left: 1rem; right: 1rem; bottom: .45rem; height: 2px; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 12%, transparent)); }
.horizon-rail span, .horizon-rail small { display: block; color: var(--muted); font: .58rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
.horizon-rail strong { display: block; margin: .28rem 0; font-size: .82rem; font-weight: 600; }
.signal-strip { display: grid; grid-template-columns: repeat(4, 1fr); }
.signal-strip article { min-width: 0; padding: 1rem; border-right: 1px solid var(--line); }
.signal-strip article:last-child { border-right: 0; }
.signal-strip span, .signal-strip p { margin: 0; color: var(--muted); font: .58rem var(--mono); text-transform: uppercase; letter-spacing: .06em; }
.signal-strip strong { display: block; margin: .55rem 0 .4rem; font: 500 clamp(1.2rem, 2.2vw, 1.9rem) var(--mono); letter-spacing: -.05em; }
.signal-strip strong small { margin-left: .25rem; color: var(--muted); font-size: .62rem; letter-spacing: 0; }
.model-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); margin-top: 1rem; }
.model-cards article { background: var(--surface); padding: .85rem; display: grid; gap: .2rem; }
.model-cards span, .model-cards small { color: var(--muted); font: .65rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
.model-cards strong { font: 700 1rem var(--mono); }
.model-cards article.reference { box-shadow: inset 0 2px var(--model-gfs); }
.model-cards em { color: var(--model-gfs); font: normal .58rem var(--mono); text-transform: uppercase; }
.method-notes { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-top: 1rem; }
.fusion-notice, .notice { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.65; }
.run-stability { display: grid; grid-template-columns: 1.5fr repeat(3, 1fr); margin: 0 0 .8rem; border: 1px solid var(--line); background: color-mix(in srgb, var(--accent) 3%, transparent); }
.run-stability > div, .run-stability article { min-width: 0; padding: .8rem 1rem; border-right: 1px solid var(--line); }
.run-stability article:last-child { border-right: 0; }
.run-stability span, .run-stability small { display: block; color: var(--muted); font: .58rem var(--mono); text-transform: uppercase; letter-spacing: .06em; }
.run-stability > div span { color: var(--accent); }
.run-stability > div small { margin-top: .35rem; }
.run-stability strong { display: block; margin-top: .45rem; font: 500 1.15rem var(--mono); }

.fusion-notice { padding-left: 1rem; border-left: 2px solid var(--accent); }
.fusion-notice strong { display: block; margin-bottom: .25rem; color: var(--accent); font: .62rem var(--mono); text-transform: uppercase; letter-spacing: .1em; }
.warning { color: var(--model-gfs); font: .72rem var(--mono); }
button:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
@media (max-width: 760px) {
  header { align-items: stretch; flex-direction: column; }
  .toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-actions { width: 100%; justify-content: space-between; }
  .console-head { align-items: flex-start; flex-direction: column; }
  .console-head > div { align-items: flex-start; flex-direction: column; gap: .35rem; }
  .horizon-rail { grid-template-columns: 1fr; }
  .horizon-rail article { border-right: 0; border-bottom: 1px solid var(--line); }
  .signal-strip { grid-template-columns: repeat(2, 1fr); }
  .run-stability { grid-template-columns: 1fr; }
  .run-stability > div, .run-stability article { border-right: 0; border-bottom: 1px solid var(--line); }
  .run-stability article:last-child { border-bottom: 0; }

  .signal-strip article:nth-child(2) { border-right: 0; }
  .signal-strip article:nth-child(-n + 2) { border-bottom: 1px solid var(--line); }
  .method-notes { grid-template-columns: 1fr; }
}
</style>
