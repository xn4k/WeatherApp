<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChartSeries } from '../types/chart'

const props = defineProps<{
  dates: string[]
  series: ChartSeries[]
  unit: string
  floorAtZero?: boolean
}>()

const width = 1000
const height = 360
const plot = { left: 60, right: 22, top: 24, bottom: 48 }
const hoverIndex = ref<number | null>(null)
const activeSeries = ref<string | null>(null)

const domain = computed(() => {
  const values = props.series.flatMap((item) => [
    ...item.values,
    ...(item.lower ?? []),
    ...(item.upper ?? []),
  ]).filter((value): value is number => value !== null && Number.isFinite(value))
  let min = values.length ? Math.min(...values) : 0
  let max = values.length ? Math.max(...values) : 1
  if (props.floorAtZero) min = 0
  const padding = Math.max((max - min) * 0.12, props.unit === '°C' ? 1.5 : 0.5)
  return { min: props.floorAtZero ? 0 : min - padding, max: max + padding }
})

const yTicks = computed(() =>
  Array.from({ length: 5 }, (_, index) =>
    domain.value.max - ((domain.value.max - domain.value.min) * index) / 4,
  ),
)

const labelIndexes = computed(() => {
  const step = Math.max(1, Math.ceil(props.dates.length / 7))
  return props.dates.map((_, index) => index).filter((index) => index % step === 0)
})

const x = (index: number) =>
  plot.left + (index / Math.max(props.dates.length - 1, 1)) * (width - plot.left - plot.right)

const y = (value: number) =>
  plot.top +
  ((domain.value.max - value) / Math.max(domain.value.max - domain.value.min, 1)) *
    (height - plot.top - plot.bottom)

function linePath(values: Array<number | null>) {
  let drawing = false
  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      drawing = false
      return ''
    }
    const command = drawing ? 'L' : 'M'
    drawing = true
    return `${command}${x(index).toFixed(1)},${y(value).toFixed(1)}`
  }).join(' ')
}

function bandPath(item: ChartSeries) {
  if (!item.lower || !item.upper) return ''
  const points: string[] = []
  item.upper.forEach((value, index) => {
    if (value !== null) points.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`)
  })
  for (let index = item.lower.length - 1; index >= 0; index -= 1) {
    const value = item.lower[index]
    if (value !== null) points.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`)
  }
  return points.length ? `M${points.join(' L')} Z` : ''
}

function setHover(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const localX = ((event.clientX - rect.left) / rect.width) * width
  const ratio = (localX - plot.left) / (width - plot.left - plot.right)
  hoverIndex.value = Math.max(0, Math.min(props.dates.length - 1, Math.round(ratio * (props.dates.length - 1))))
}

function moveHover(direction: number) {
  const current = hoverIndex.value ?? 0
  hoverIndex.value = Math.max(0, Math.min(props.dates.length - 1, current + direction))
}

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(`${date}T12:00:00`))

const valueLabel = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)} ${props.unit}`
</script>

<template>
  <div class="chart-shell">
    <div class="legend" aria-label="Datenreihen">
      <button
        v-for="item in series"
        :key="item.id"
        type="button"
        :class="{ active: activeSeries === item.id }"
        @click="activeSeries = activeSeries === item.id ? null : item.id"
      >
        <i :style="{ background: item.color }"></i>{{ item.label }}
      </button>
    </div>

    <svg
      class="chart"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      tabindex="0"
      aria-label="Interaktiver Langfristtrend. Mit Pfeiltasten tageweise navigieren."
      @pointermove="setHover"
      @pointerdown="setHover"
      @pointerleave="hoverIndex = null"
      @keydown.left.prevent="moveHover(-1)"
      @keydown.right.prevent="moveHover(1)"
    >
      <g class="grid">
        <template v-for="tick in yTicks" :key="tick">
          <line :x1="plot.left" :x2="width - plot.right" :y1="y(tick)" :y2="y(tick)" />
          <text :x="plot.left - 10" :y="y(tick) + 4">{{ tick.toFixed(0) }}</text>
        </template>
      </g>
      <g class="dates">
        <text
          v-for="index in labelIndexes"
          :key="dates[index]"
          :x="x(index)"
          :y="height - 15"
        >{{ dateLabel(dates[index]) }}</text>
      </g>
      <path
        v-for="item in series.filter((entry) => entry.lower && entry.upper)"
        :key="`${item.id}-band`"
        class="band"
        :class="{ faded: activeSeries && activeSeries !== item.id }"
        :d="bandPath(item)"
        :fill="item.color"
      />
      <path
        v-for="item in series"
        :key="item.id"
        class="series"
        :class="{ faded: activeSeries && activeSeries !== item.id, emphasized: item.emphasized }"
        :d="linePath(item.values)"
        :stroke="item.color"
        @pointerenter="activeSeries = item.id"
      />
      <g v-if="hoverIndex !== null" class="cursor">
        <line :x1="x(hoverIndex)" :x2="x(hoverIndex)" :y1="plot.top" :y2="height - plot.bottom" />
        <circle
          v-for="item in series"
          :key="item.id"
          :cx="x(hoverIndex)"
          :cy="item.values[hoverIndex] === null ? -20 : y(item.values[hoverIndex] ?? 0)"
          r="5"
          :fill="item.color"
        />
      </g>
    </svg>

    <div v-if="hoverIndex !== null" class="readout" aria-live="polite">
      <strong>{{ dateLabel(dates[hoverIndex]) }}</strong>
      <span v-for="item in series" :key="item.id">
        <i :style="{ background: item.color }"></i>{{ item.label }}
        <b>{{ valueLabel(item.values[hoverIndex]) }}</b>
        <small v-if="item.lower && item.upper">
          P10–P90 {{ valueLabel(item.lower[hoverIndex]) }} bis {{ valueLabel(item.upper[hoverIndex]) }}
        </small>
      </span>
    </div>
  </div>
</template>

<style scoped>
.chart-shell { position: relative; min-width: 0; }
.legend { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 .8rem; }
.legend button { border: 1px solid var(--line); background: transparent; color: var(--muted); padding: .45rem .7rem; font: 500 .72rem var(--mono); letter-spacing: .04em; cursor: pointer; }
.legend button:hover, .legend button.active { border-color: var(--line-strong); color: var(--text); background: var(--surface-high); }
.legend i, .readout i { width: .55rem; height: .55rem; display: inline-block; margin-right: .45rem; border-radius: 50%; }
.chart { display: block; width: 100%; min-width: 680px; outline: none; touch-action: none; }
.chart:focus { box-shadow: inset 0 0 0 1px var(--accent); }
.grid line { stroke: var(--line); stroke-width: 1; }
.grid text, .dates text { fill: var(--muted); font: 24px var(--mono); }
.grid text { text-anchor: end; }
.dates text { text-anchor: middle; }
.band { opacity: .12; transition: opacity .16s ease; }
.series { fill: none; stroke-width: 3; vector-effect: non-scaling-stroke; transition: opacity .16s ease, stroke-width .16s ease; }
.series.emphasized { stroke-width: 4; }
.faded { opacity: .14; }
.cursor line { stroke: var(--text); stroke-width: 1; stroke-dasharray: 5 5; opacity: .55; }
.cursor circle { stroke: var(--surface); stroke-width: 3; vector-effect: non-scaling-stroke; }
.readout { display: flex; gap: .85rem 1.2rem; flex-wrap: wrap; align-items: center; min-height: 2.6rem; padding: .7rem .9rem; border-top: 1px solid var(--line); font: .76rem var(--mono); }
.readout > span { color: var(--muted); }
.readout b { color: var(--text); margin-left: .35rem; }
.readout small { display: block; margin: .22rem 0 0 1rem; }
@media (max-width: 760px) {
  .chart-shell { overflow-x: auto; }
  .legend, .readout { position: sticky; left: 0; width: calc(100vw - 3rem); }
}
</style>
