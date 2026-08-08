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
    ...(item.innerLower ?? []),
    ...(item.innerUpper ?? []),
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

function bandPath(item: ChartSeries, inner = false) {
  const lower = inner ? item.innerLower : item.lower
  const upper = inner ? item.innerUpper : item.upper
  if (!lower || !upper) return ''
  const points: string[] = []
  upper.forEach((value, index) => {
    if (value !== null) points.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`)
  })
  for (let index = lower.length - 1; index >= 0; index -= 1) {
    const value = lower[index]
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
        :class="{
          active: activeSeries === item.id,
          primary: item.emphasized,
          secondary: item.secondary,
        }"
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
        class="band outer"
        :class="{ faded: activeSeries && activeSeries !== item.id }"
        :d="bandPath(item)"
        :fill="item.color"
      />
      <path
        v-for="item in series.filter((entry) => entry.innerLower && entry.innerUpper)"
        :key="`${item.id}-inner-band`"
        class="band inner"
        :class="{ faded: activeSeries && activeSeries !== item.id }"
        :d="bandPath(item, true)"
        :fill="item.color"
      />
      <path
        v-for="item in series"
        :key="item.id"
        class="series"
        :class="{
          faded: activeSeries && activeSeries !== item.id,
          emphasized: item.emphasized,
          secondary: item.secondary,
        }"
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
          P10–P90 {{ valueLabel(item.lower[hoverIndex]) }} — {{ valueLabel(item.upper[hoverIndex]) }}
        </small>
        <small v-if="item.innerLower && item.innerUpper" class="inner-range">
          P25–P75 {{ valueLabel(item.innerLower[hoverIndex]) }} — {{ valueLabel(item.innerUpper[hoverIndex]) }}
        </small>
        <small v-if="item.pointDetails?.[hoverIndex]" class="point-detail">{{ item.pointDetails[hoverIndex] }}</small>
      </span>
    </div>
  </div>
</template>

<style scoped>
.chart-shell { position: relative; min-width: 0; border: 1px solid var(--line); background: color-mix(in srgb, var(--background) 52%, transparent); overflow: hidden; }
.chart-shell::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, transparent 49.9%, var(--line) 50%, transparent 50.1%), linear-gradient(transparent 49.9%, var(--line) 50%, transparent 50.1%); background-size: 8rem 8rem; opacity: .22; }
.legend { position: relative; display: flex; flex-wrap: wrap; gap: .4rem; min-height: 3.6rem; margin: 0; padding: .75rem; border-bottom: 1px solid var(--line); }
.legend button { border: 1px solid transparent; background: transparent; color: var(--muted); padding: .45rem .65rem; font: 500 .68rem var(--mono); letter-spacing: .04em; cursor: pointer; transition: color .16s ease, border-color .16s ease, opacity .16s ease; }
.legend button.primary { border-color: color-mix(in srgb, var(--accent) 46%, var(--line)); color: var(--text); background: color-mix(in srgb, var(--accent) 7%, transparent); }
.legend button.secondary { opacity: .7; }
.legend button:hover, .legend button.active { border-color: var(--line-strong); color: var(--text); background: var(--surface-high); opacity: 1; }
.legend i, .readout i { width: .55rem; height: .55rem; display: inline-block; margin-right: .45rem; border-radius: 50%; }
.chart { position: relative; display: block; width: 100%; min-width: 680px; outline: none; touch-action: none; }
.chart:focus { box-shadow: inset 0 0 0 1px var(--accent); }
.grid line { stroke: var(--line); stroke-width: 1; }
.grid text, .dates text { fill: var(--muted); font: 24px var(--mono); }
.grid text { text-anchor: end; }
.dates text { text-anchor: middle; }
.band { transition: opacity .16s ease; }
.band.outer { opacity: .1; }
.band.inner { opacity: .2; }
.series { fill: none; stroke-width: 3; vector-effect: non-scaling-stroke; transition: opacity .16s ease, stroke-width .16s ease; }
.series.emphasized { stroke-width: 4; }
.series.secondary { stroke-width: 1.5; opacity: .48; stroke-dasharray: 5 5; }
.faded { opacity: .14; }
.cursor line { stroke: var(--text); stroke-width: 1; stroke-dasharray: 5 5; opacity: .55; }
.cursor circle { stroke: var(--surface); stroke-width: 3; vector-effect: non-scaling-stroke; }
.readout { position: relative; display: flex; gap: .85rem 1.2rem; flex-wrap: wrap; align-items: flex-start; min-height: 3.2rem; padding: .8rem .9rem; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--surface-high) 72%, transparent); font: .72rem var(--mono); }
.readout > strong { padding-top: .15rem; }
.readout > span { color: var(--muted); max-width: 22rem; }
.readout b { color: var(--text); margin-left: .35rem; }
.readout small { display: block; margin: .22rem 0 0 1rem; }
.readout .inner-range { color: var(--text); }
.readout .point-detail { color: var(--accent); text-transform: uppercase; letter-spacing: .06em; }
@media (max-width: 760px) {
  .chart-shell { overflow-x: auto; }
  .legend, .readout { position: sticky; left: 0; width: calc(100vw - 3rem); z-index: 2; background: var(--surface); }
}
</style>
