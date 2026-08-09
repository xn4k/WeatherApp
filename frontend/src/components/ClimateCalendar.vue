<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getClimateDay } from '../adapters/firebase-weather/climate'
import type { ClimateDay } from '../types/evidence'
import type { Outlook } from '../types/outlook'

const props = defineProps<{ latitude: number; longitude: number; outlook: Outlook }>()
const dates = computed(() => props.outlook.fusion?.daily.map((day) => day.date) ?? [])
const selectedDate = ref(dates.value[0] ?? new Date().toISOString().slice(0, 10))
const climate = ref<ClimateDay | null>(props.outlook.climateToday ?? null)
const loading = ref(false)
const error = ref('')
const historyIndex = ref(0)
const cache = new Map<string, ClimateDay | null>()

function monthDay(date: string) { return date.slice(5) }

async function load(date: string) {
  const key = monthDay(date)
  selectedDate.value = date
  error.value = ''
  const rootDay = props.outlook.climateToday
  if (rootDay?.monthDay === key) climate.value = rootDay
  else if (cache.has(key)) climate.value = cache.get(key) ?? null
  else {
    loading.value = true
    try {
      climate.value = await getClimateDay(props.latitude, props.longitude, key)
      cache.set(key, climate.value)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Klimatag konnte nicht geladen werden.'
      climate.value = null
    } finally {
      loading.value = false
    }
  }
  historyIndex.value = Math.max(0, (climate.value?.history.length ?? 1) - 1)
}

watch(() => props.outlook.refreshedAt, () => {
  cache.clear()
  void load(dates.value[0] ?? new Date().toISOString().slice(0, 10))
}, { immediate: true })

const forecast = computed(() => props.outlook.fusion?.daily.find((day) => day.date === selectedDate.value))
const historical = computed(() => climate.value?.history[historyIndex.value])
const anomaly = computed(() => {
  const forecastMedian = forecast.value?.temperatureP50
  const normal = climate.value?.temperatureP50
  return Number.isFinite(forecastMedian) && Number.isFinite(normal) ? Number(forecastMedian) - Number(normal) : null
})
const percentile = computed(() => {
  const median = forecast.value?.temperatureP50
  const history = climate.value?.history.map((entry) => entry.temperatureMean).filter(Number.isFinite) as number[] | undefined
  return Number.isFinite(median) && history?.length
    ? Math.round(100 * history.filter((value) => value <= Number(median)).length / history.length)
    : null
})
const markerPosition = computed(() => {
  const low = climate.value?.temperatureP10
  const high = climate.value?.temperatureP90
  const current = forecast.value?.temperatureP50
  if (![low, high, current].every(Number.isFinite) || low === high) return 50
  return Math.max(2, Math.min(98, 100 * (Number(current) - Number(low)) / (Number(high) - Number(low))))
})

function shortDate(date: string) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
    .format(new Date(`${date}T12:00:00`))
}
function value(number: number | null | undefined, digits = 1) {
  return Number.isFinite(number) ? Number(number).toFixed(digits) : '—'
}
</script>

<template>
  <section class="climate-calendar" aria-label="Historischer DWD Klimakalender">
    <header>
      <div>
        <p class="eyebrow">DWD // Climate Time Machine</p>
        <h3>Derselbe Tag. Jahrzehnte Wettergeschichte.</h3>
        <p>Die Prognose trifft auf Stationsmessungen und die Klimanormalperiode 1991–2020 – ohne Anekdote als Trend zu verkaufen.</p>
      </div>
      <div v-if="climate" class="climate-source">
        <span>Messstation</span><strong>{{ climate.station.name }}</strong>
        <small>{{ climate.firstYear }}–{{ climate.lastYear }} · {{ climate.sampleYears }} Jahre</small>
      </div>
    </header>

    <div class="climate-days">
      <button v-for="date in dates" :key="date" type="button" :class="{ active: selectedDate === date }" @click="load(date)">{{ shortDate(date) }}</button>
    </div>

    <div v-if="loading" class="climate-status">Stationsarchiv wird geöffnet …</div>
    <div v-else-if="error" class="climate-status">{{ error }}</div>
    <div v-else-if="!climate" class="climate-status">Für diesen Standort liegt noch kein zentral erzeugter DWD-Klimakalender vor.</div>
    <template v-else>
      <div class="climate-grid">
        <article class="anomaly-card">
          <span>Prognose vs. Klimamitte</span>
          <strong :class="{ hot: Number(anomaly) > 0, cold: Number(anomaly) < 0 }">{{ Number(anomaly) > 0 ? '+' : '' }}{{ value(anomaly) }}<small>°C</small></strong>
          <p v-if="percentile !== null">Wärmer als etwa {{ percentile }} % der verfügbaren Messjahre dieses Kalendertags.</p>
          <p v-else>Perzentil noch nicht berechenbar.</p>
        </article>
        <article class="normal-card">
          <span>1991–2020 · P10 / P50 / P90</span>
          <div class="normal-scale">
            <i class="forecast-marker" :style="{ left: `${markerPosition}%` }"><b>{{ value(forecast?.temperatureP50) }}°</b></i>
          </div>
          <div class="normal-labels"><b>{{ value(climate.temperatureP10) }}°</b><b>{{ value(climate.temperatureP50) }}°</b><b>{{ value(climate.temperatureP90) }}°</b></div>
          <p>Der Marker zeigt den aktuellen Fusion-P50 relativ zum historischen 80-%-Korridor.</p>
        </article>
        <article class="record-card">
          <span>Stationsrekorde am {{ climate.monthDay.split('-').reverse().join('.') }}.</span>
          <dl>
            <div><dt>Heißester Tageswert</dt><dd>{{ value(climate.maximumRecord?.value) }} °C <small>{{ climate.maximumRecord?.year }}</small></dd></div>
            <div><dt>Kältester Tageswert</dt><dd>{{ value(climate.minimumRecord?.value) }} °C <small>{{ climate.minimumRecord?.year }}</small></dd></div>
            <div><dt>Nassester Tag</dt><dd>{{ value(climate.wettestRecord?.value) }} mm <small>{{ climate.wettestRecord?.year }}</small></dd></div>
          </dl>
        </article>
      </div>

      <div v-if="historical" class="history-console">
        <div class="history-year">
          <span>Archivjahr</span><strong>{{ historical.date.slice(0, 4) }}</strong>
          <input v-model.number="historyIndex" type="range" min="0" :max="Math.max(0, climate.history.length - 1)" aria-label="Historisches Jahr auswählen">
          <small>{{ climate.firstYear }} ← Messreihe → {{ climate.lastYear }}</small>
        </div>
        <article><span>Tagesmittel</span><strong>{{ value(historical.temperatureMean) }} °C</strong></article>
        <article><span>Min / Max</span><strong>{{ value(historical.temperatureMin) }} / {{ value(historical.temperatureMax) }} °C</strong></article>
        <article><span>Niederschlag</span><strong>{{ value(historical.precipitationSum) }} mm</strong></article>
        <article><span>Sonnenschein</span><strong>{{ value(historical.sunshineHours) }} h</strong></article>
      </div>

      <footer>
        <span>Regenhistorie: ≥1 mm an {{ value(climate.rainFrequency1mm) }} % · ≥10 mm an {{ value(climate.rainFrequency10mm) }} % der verfügbaren Jahre.</span>
        <a :href="climate.station.datasetUrl" target="_blank" rel="noreferrer">DWD CDC · CC BY 4.0 ↗</a>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.climate-calendar { margin-top: 1rem; border: 1px solid var(--line); background: radial-gradient(circle at 15% 0, color-mix(in srgb, var(--orange) 7%, transparent), transparent 30rem), #111411; }
header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 2rem; padding: 1.4rem; border-bottom: 1px solid var(--line); }
header h3 { margin: .2rem 0 .45rem; font-size: clamp(1.45rem, 3vw, 2.35rem); font-weight: 500; letter-spacing: -.045em; }
header p:not(.eyebrow) { max-width: 50rem; margin: 0; color: var(--muted); line-height: 1.55; }
.climate-source { min-width: 14rem; padding: .8rem 1rem; border-left: 2px solid var(--orange); background: color-mix(in srgb, var(--orange) 5%, transparent); font-family: var(--mono); }
.climate-source span, .climate-source small { display: block; color: var(--muted); font-size: .57rem; text-transform: uppercase; }
.climate-source strong { display: block; margin: .3rem 0; font-size: .85rem; }
.climate-days { display: flex; overflow-x: auto; border-bottom: 1px solid var(--line); }
.climate-days button { flex: 0 0 auto; padding: .65rem .8rem; border: 0; border-right: 1px solid var(--line); color: var(--muted); background: transparent; font: .62rem var(--mono); cursor: pointer; }
.climate-days button.active { color: #111; background: var(--orange); }
.climate-status { padding: 2rem 1.4rem; color: var(--muted); }
.climate-grid { display: grid; grid-template-columns: .75fr 1.5fr 1fr; }
.climate-grid article { min-height: 13rem; padding: 1.2rem; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.climate-grid article:last-child { border-right: 0; }
.climate-grid article > span, .history-console span { color: var(--muted); font: .57rem var(--mono); letter-spacing: .07em; text-transform: uppercase; }
.anomaly-card > strong { display: block; margin: 1.1rem 0 .5rem; font: 400 3rem var(--mono); }
.anomaly-card > strong.hot { color: var(--orange); }.anomaly-card > strong.cold { color: var(--cyan); }
.anomaly-card strong small { margin-left: .3rem; color: var(--muted); font-size: .65rem; }
.climate-grid p { color: var(--muted); font-size: .7rem; line-height: 1.5; }
.normal-scale { position: relative; height: .7rem; margin: 4rem 0 .7rem; background: linear-gradient(90deg, var(--cyan), var(--accent), var(--orange)); }
.forecast-marker { position: absolute; top: -1.2rem; width: 2px; height: 3rem; background: var(--text); transform: translateX(-1px); }
.forecast-marker b { position: absolute; left: 50%; bottom: 3.2rem; padding: .25rem .35rem; color: var(--background); background: var(--text); font: .62rem var(--mono); transform: translateX(-50%); white-space: nowrap; }
.normal-labels { display: flex; justify-content: space-between; font: .66rem var(--mono); }
.record-card dl { margin: .7rem 0 0; }
.record-card dl div { display: flex; justify-content: space-between; gap: 1rem; padding: .7rem 0; border-bottom: 1px solid var(--line); font: .65rem var(--mono); }
.record-card dt { color: var(--muted); }.record-card dd { margin: 0; text-align: right; }.record-card dd small { color: var(--orange); }
.history-console { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); border-bottom: 1px solid var(--line); }
.history-console > div, .history-console article { padding: 1rem; border-right: 1px solid var(--line); }
.history-console article:last-child { border-right: 0; }
.history-console strong { display: block; margin-top: .4rem; font: 500 .9rem var(--mono); }
.history-year { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; }
.history-year input { grid-column: 1 / -1; width: 100%; accent-color: var(--orange); }
.history-year small { grid-column: 1 / -1; color: var(--muted); font: .52rem var(--mono); }
footer { min-height: auto; display: flex; justify-content: space-between; gap: 1rem; padding: .8rem 1.2rem; color: var(--muted); font: .58rem var(--mono); }
footer a { color: var(--orange); }
@media (max-width: 900px) { header, .climate-grid { grid-template-columns: 1fr; } .climate-source { min-width: 0; } .climate-grid article { border-right: 0; } .history-console { grid-template-columns: repeat(2, 1fr); } .history-year { grid-column: 1 / -1; } footer { flex-direction: column; } }
</style>
