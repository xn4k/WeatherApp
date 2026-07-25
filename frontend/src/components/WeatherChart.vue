<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HourlyPoint, ModelForecast } from '../types/weather'

type Metric = 'temperature' | 'precipitationProbability' | 'windSpeed'

const props = defineProps<{
  models: ModelForecast[]
  currentTime: string
}>()

const metric = ref<Metric>('temperature')
const activeIndex = ref(0)
const chartFocused = ref(false)

const metrics: { id: Metric; label: string; unit: string }[] = [
  { id: 'temperature', label: 'Temperatur', unit: '°C' },
  { id: 'precipitationProbability', label: 'Niederschlag', unit: '%' },
  { id: 'windSpeed', label: 'Wind', unit: 'km/h' },
]

const palette = ['var(--model-icon)', 'var(--model-ifs)', 'var(--model-gfs)']

const visibleModels = computed(() =>
  props.models.map((model) => {
    const currentHour = props.currentTime.slice(0, 13)
    const start = model.hourly.findIndex((point) => point.time.slice(0, 13) >= currentHour)
    return {
      ...model,
      hourly: model.hourly.slice(start < 0 ? 0 : start, (start < 0 ? 0 : start) + 36),
    }
  }),
)

const reference = computed(() => visibleModels.value[0]?.hourly ?? [])
const values = computed(() =>
  visibleModels.value.flatMap((model) => model.hourly.map((point) => point[metric.value])),
)
const minimum = computed(() => {
  if (metric.value === 'precipitationProbability') return 0
  const value = Math.min(...values.value)
  return Number.isFinite(value) ? Math.floor(value - 2) : 0
})
const maximum = computed(() => {
  if (metric.value === 'precipitationProbability') return 100
  const value = Math.max(...values.value)
  return Number.isFinite(value) ? Math.ceil(value + 2) : 1
})
const selectedMetric = computed(() => metrics.find((item) => item.id === metric.value)!)

function x(index: number) {
  const count = Math.max(reference.value.length - 1, 1)
  return 60 + (index / count) * 880
}

function y(value: number) {
  const range = maximum.value - minimum.value || 1
  return 300 - ((value - minimum.value) / range) * 240
}

function points(model: ModelForecast) {
  return model.hourly
    .map((point, index) => `${x(index).toFixed(1)},${y(point[metric.value]).toFixed(1)}`)
    .join(' ')
}

function labelTime(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    hour: '2-digit',
  }).format(new Date(value))
}

function exactTime(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function updatePointer(event: PointerEvent) {
  const element = event.currentTarget as SVGElement
  const bounds = element.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
  activeIndex.value = Math.round(ratio * Math.max(reference.value.length - 1, 0))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, reference.value.length - 1)
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  }
}

function pointAt(model: ModelForecast): HourlyPoint | undefined {
  return model.hourly[activeIndex.value]
}
</script>

<template>
  <section class="chart-panel panel">
    <header class="panel-header">
      <div>
        <p class="eyebrow">36 Stunden · Modellvergleich</p>
        <h2>{{ selectedMetric.label }} im Verlauf</h2>
      </div>
      <div class="metric-switcher" aria-label="Messgröße auswählen">
        <button
          v-for="item in metrics"
          :key="item.id"
          type="button"
          :class="{ active: metric === item.id }"
          @click="metric = item.id"
        >
          {{ item.label }}
        </button>
      </div>
    </header>

    <div class="legend" aria-label="Wettermodelle">
      <span v-for="(model, index) in visibleModels" :key="model.id">
        <i :style="{ backgroundColor: palette[index] }"></i>{{ model.label }}
      </span>
      <small>Linien zeigen Modellwerte, keine Messungen</small>
    </div>

    <div class="chart-wrap">
      <svg
        class="weather-chart"
        viewBox="0 0 1000 360"
        role="img"
        tabindex="0"
        :aria-label="`${selectedMetric.label} der Wettermodelle für 36 Stunden`"
        @pointermove="updatePointer"
        @pointerenter="chartFocused = true"
        @pointerleave="chartFocused = false"
        @focus="chartFocused = true"
        @blur="chartFocused = false"
        @keydown="onKeydown"
      >
        <g class="grid">
          <line v-for="step in 5" :key="step" x1="60" x2="940" :y1="60 + (step - 1) * 60" :y2="60 + (step - 1) * 60" />
          <text v-for="step in 5" :key="`label-${step}`" x="48" :y="65 + (step - 1) * 60" text-anchor="end">
            {{ Math.round(maximum - ((step - 1) / 4) * (maximum - minimum)) }}
          </text>
        </g>

        <g class="time-labels">
          <template v-for="(point, index) in reference" :key="point.time">
            <text
              v-if="index % 6 === 0"
              :x="x(index)"
              y="333"
              :text-anchor="index === 0 ? 'start' : index > reference.length - 5 ? 'end' : 'middle'"
            >
              {{ labelTime(point.time) }}
            </text>
          </template>
        </g>

        <polyline
          v-for="(model, index) in visibleModels"
          :key="model.id"
          class="model-line"
          :style="{ stroke: palette[index] }"
          :points="points(model)"
        />

        <g v-if="reference.length && chartFocused" class="cursor">
          <line :x1="x(activeIndex)" :x2="x(activeIndex)" y1="54" y2="304" />
          <circle
            v-for="(model, index) in visibleModels"
            :key="model.id"
            :cx="x(activeIndex)"
            :cy="y(pointAt(model)?.[metric] ?? 0)"
            r="5"
            :style="{ fill: palette[index] }"
          />
        </g>
      </svg>

      <div
        v-if="reference.length && chartFocused"
        class="chart-tooltip"
        :class="{ right: activeIndex > reference.length / 2 }"
      >
        <strong>{{ exactTime(reference[activeIndex].time) }}</strong>
        <span v-for="(model, index) in visibleModels" :key="model.id">
          <i :style="{ backgroundColor: palette[index] }"></i>
          {{ model.label }}
          <b>{{ pointAt(model)?.[metric]?.toFixed(1) }} {{ selectedMetric.unit }}</b>
        </span>
      </div>
    </div>
  </section>
</template>

