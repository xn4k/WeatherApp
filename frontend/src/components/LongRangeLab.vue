<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { getOutlook } from '../api/outlook'
import type { ChartSeries } from '../types/chart'
import type { Outlook, OutlookModelDay, OutlookView } from '../types/outlook'
import LongRangeChart from './LongRangeChart.vue'

const props = defineProps<{ latitude: number; longitude: number }>()

type ModelMetric = 'temperatureMax' | 'temperatureMin' | 'precipitation'
type EnsembleMetric = 'temperature' | 'precipitation'

const view = ref<OutlookView | null>(null)
const modelMetric = ref<ModelMetric>('temperatureMax')
const ensembleMetric = ref<EnsembleMetric>('temperature')
const loading = ref(false)
const error = ref('')
const results = reactive<Partial<Record<OutlookView, Outlook>>>({})
let request: AbortController | null = null

const data = computed(() => (view.value ? results[view.value] : undefined))
const modelColors = ['var(--model-icon)', 'var(--model-ifs)', 'var(--text)', 'var(--model-gfs)']
const ensembleColors = ['var(--model-icon)', 'var(--model-ifs)']

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const dates = computed(() => {
  const groups = data.value?.mode === 'models' ? data.value.models : data.value?.ensembles
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
    return (data.value.ensembles ?? []).map((model, index) => ({
      id: model.id,
      label: `${model.short} · ${model.memberCount} Läufe`,
      color: ensembleColors[index % ensembleColors.length],
      values: model.daily.map((day) =>
        ensembleMetric.value === 'temperature' ? day.temperatureMedian : day.precipitationMedian,
      ),
      lower: model.daily.map((day) =>
        ensembleMetric.value === 'temperature' ? day.temperatureP10 : day.precipitationP10,
      ),
      upper: model.daily.map((day) =>
        ensembleMetric.value === 'temperature' ? day.temperatureP90 : day.precipitationP90,
      ),
    }))
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
        <p class="eyebrow">Unsicherheit sichtbar gemacht</p>
        <h2>Langfrist-Labor</h2>
        <p>Keine einzelne Wunderlinie: Modelle, Median, Spannweite und echte Ensembleläufe.</p>
      </div>
      <nav aria-label="Prognosezeitraum">
        <button type="button" :class="{ active: view === '16' }" @click="selectView('16')">
          16 Tage <small>Modelle</small>
        </button>
        <button type="button" :class="{ active: view === '30' }" @click="selectView('30')">
          30 Tage <small>Ensembles</small>
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
        <span>{{ data.source === 'cache' ? 'Cache · ' : '' }}Open-Meteo</span>
      </div>

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
        <article v-for="model in data.ensembles" :key="model.id">
          <span>{{ model.short }}</span><strong>{{ model.memberCount }} Läufe</strong><small>{{ model.name }}</small>
        </article>
      </div>
      <p class="notice">{{ data.notice }}</p>
      <p v-for="warning in data.warnings" :key="warning" class="warning">{{ warning }}</p>
    </template>
  </section>
</template>

<style scoped>
.long-range { padding: clamp(1.2rem, 3vw, 2.2rem); overflow: hidden; }
header { display: flex; justify-content: space-between; gap: 2rem; align-items: end; margin-bottom: 1.5rem; }
header h2 { margin: .2rem 0 .5rem; font-size: clamp(1.6rem, 3vw, 2.5rem); letter-spacing: -.04em; }
header p:not(.eyebrow), .intro p, .notice, .warning { color: var(--muted); max-width: 48rem; }
nav { display: grid; grid-template-columns: repeat(2, minmax(8rem, 1fr)); }
nav button { padding: .8rem 1rem; border: 1px solid var(--line); background: transparent; color: var(--muted); text-align: left; cursor: pointer; font: 700 1rem var(--mono); }
nav button + button { border-left: 0; }
nav button.active { background: var(--accent); color: var(--background); border-color: var(--accent); }
nav small { display: block; margin-top: .2rem; font-size: .62rem; text-transform: uppercase; letter-spacing: .1em; }
.intro, .status { min-height: 12rem; display: grid; place-content: center; text-align: center; border: 1px dashed var(--line-strong); }
.intro strong { font: 600 1.1rem var(--mono); }
.status { color: var(--muted); font: .85rem var(--mono); }
.status.error { color: var(--model-gfs); gap: 1rem; }
.status button { justify-self: center; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: .8rem; }
.toolbar > span { color: var(--muted); font: .68rem var(--mono); text-transform: uppercase; }
.metrics { display: flex; flex-wrap: wrap; }
.metrics button, .status button { border: 1px solid var(--line); background: transparent; color: var(--muted); padding: .5rem .75rem; font: .72rem var(--mono); cursor: pointer; }
.metrics button + button { border-left: 0; }
.metrics button.active { color: var(--text); background: var(--surface-high); border-color: var(--line-strong); }
.model-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); margin-top: 1rem; }
.model-cards article { background: var(--surface); padding: .85rem; display: grid; gap: .2rem; }
.model-cards span, .model-cards small { color: var(--muted); font: .65rem var(--mono); text-transform: uppercase; letter-spacing: .08em; }
.model-cards strong { font: 700 1rem var(--mono); }
.notice { margin: 1rem 0 0; font-size: .78rem; line-height: 1.6; }
.warning { color: var(--model-gfs); font: .72rem var(--mono); }
@media (max-width: 760px) {
  header { align-items: stretch; flex-direction: column; }
  .toolbar { align-items: flex-start; flex-direction: column; }
}
</style>
