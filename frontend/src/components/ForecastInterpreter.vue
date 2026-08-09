<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  buildDeterministicReading,
  buildFusionReading,
} from '../lib/forecast-interpretation'
import type { Outlook } from '../types/outlook'
import MetricHelp from './MetricHelp.vue'

const props = defineProps<{ outlook: Outlook }>()

function availableDates() {
  if (props.outlook.mode === 'ensemble') {
    return props.outlook.fusion?.daily.map((day) => day.date) ?? []
  }
  return [...new Set((props.outlook.models ?? []).flatMap((model) =>
    model.daily.map((day) => day.date),
  ))].sort()
}

const selectedDate = ref(availableDates()[1] ?? availableDates()[0] ?? '')

watch(() => [props.outlook.refreshedAt, props.outlook.mode], () => {
  const dates = availableDates()
  selectedDate.value = dates[1] ?? dates[0] ?? ''
})

const dates = computed(availableDates)
const reading = computed(() => props.outlook.mode === 'models'
  ? buildDeterministicReading(props.outlook, selectedDate.value)
  : buildFusionReading(props.outlook, selectedDate.value))

function shortDate(date: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(date + 'T12:00:00'))
}

function number(value: number | null | undefined, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '\u2014'
}
</script>

<template>
  <section v-if="reading" class="interpreter" aria-label="ISOBAR Forecast Interpreter">
    <header class="interpreter-head">
      <div>
        <p class="eyebrow">ISOBAR // Forecast Interpreter</p>
        <h3>Die Zahlen bleiben. Jetzt sagen sie, was sie bedeuten.</h3>
        <p>Rohdaten, wissenschaftliche Bedeutung und eine klare Wetteraussage &ndash; ohne Schlagzeilenlogik.</p>
      </div>
      <div class="signal-state" :class="reading.status">
        <span>Datenlesart</span>
        <strong>{{ reading.statusLabel }}</strong>
        <small>keine Trefferquote</small>
      </div>
    </header>

    <nav class="date-rail" aria-label="Tag f&uuml;r Interpretation">
      <button
        v-for="date in dates"
        :key="date"
        type="button"
        :class="{ active: selectedDate === date }"
        @click="selectedDate = date"
      >
        {{ shortDate(date) }}
      </button>
    </nav>

    <div class="forecast-readout">
      <div>
        <span>{{ reading.mode === 'models' ? '16 Tage / Einzell\u00e4ufe' : '30 Tage / Fusion' }}</span>
        <h4>{{ reading.headline }}</h4>
      </div>
      <p>{{ reading.verdict }}</p>
    </div>

    <div class="metric-grid">
      <article v-for="metric in reading.metrics" :key="metric.label">
        <div class="metric-label">
          <span>{{ metric.label }}</span>
          <MetricHelp
            :title="metric.helpTitle"
            :text="metric.helpText"
            :formula="metric.formula"
            :caution="metric.caution"
          />
        </div>
        <strong>{{ metric.value }}</strong>
        <p>{{ metric.detail }}</p>
      </article>
    </div>

    <div class="interpretation-ladder">
      <article>
        <span>01 / Rohdaten</span>
        <strong>Unver&auml;ndert</strong>
        <p>{{ reading.headline }}</p>
      </article>
      <article>
        <span>02 / Wissenschaftlich</span>
        <strong>Was die Kennzahl misst</strong>
        <p>{{ reading.scientific }}</p>
      </article>
      <article>
        <span>03 / Einfach gesagt</span>
        <strong>Was du daraus lesen kannst</strong>
        <p>{{ reading.plain }}</p>
      </article>
      <article class="isobar-verdict">
        <span>04 / ISOBAR Prognose</span>
        <strong>N&uuml;chterne Synthese</strong>
        <p>{{ reading.verdict }}</p>
        <p class="comfort">{{ reading.comfort }}</p>
      </article>
      <article class="limit">
        <span>05 / Grenze</span>
        <strong>Was wir nicht behaupten</strong>
        <p>{{ reading.limit }}</p>
      </article>
    </div>

    <div v-if="reading.modelRows.length" class="model-matrix">
      <div class="matrix-head">
        <span>Einzellauf</span>
        <span>Minimum</span>
        <span>Maximum</span>
        <span>Gef&uuml;hlt max.</span>
        <span>Regen</span>
        <span>RH Mittel</span>
      </div>
      <div v-for="row in reading.modelRows" :key="row.id">
        <strong>{{ row.short }}</strong>
        <span>{{ number(row.temperatureMin) }} &deg;C</span>
        <span>{{ number(row.temperatureMax) }} &deg;C</span>
        <span>{{ number(row.apparentTemperatureMax) }} &deg;C</span>
        <span>{{ number(row.precipitation) }} mm</span>
        <span>{{ number(row.relativeHumidityMean, 0) }} %</span>
      </div>
      <p>Die Tabelle zeigt Modelll&ouml;sungen, keine vier gleichwertig kalibrierten Wahrscheinlichkeiten.</p>
    </div>

    <footer>
      <span>Erkl&auml;rungsbasis</span>
      <a href="https://www.dwd.de/DE/forschung/wettervorhersage/num_modellierung/04_ensemble_methoden/ensemble_vorhersage/ensemble_vorhersage_node.html" target="_blank" rel="noreferrer">DWD Ensemble-Vorhersage &nearr;</a>
      <a href="https://open-meteo.com/en/docs/ensemble-api" target="_blank" rel="noreferrer">Open-Meteo Variablendefinitionen &nearr;</a>
    </footer>
  </section>
</template>

<style scoped>
.interpreter {
  margin-top: 1rem;
  border: 1px solid var(--line);
  background:
    radial-gradient(circle at 90% 0, color-mix(in srgb, var(--accent) 8%, transparent), transparent 28rem),
    color-mix(in srgb, var(--surface) 92%, var(--background));
}
.interpreter-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2rem;
  align-items: end;
  padding: 1.4rem;
  border-bottom: 1px solid var(--line);
}
.interpreter-head h3 {
  margin: .2rem 0 .45rem;
  font-size: clamp(1.45rem, 3vw, 2.35rem);
  font-weight: 500;
  letter-spacing: -.045em;
}
.interpreter-head p:not(.eyebrow) {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}
.signal-state {
  min-width: 13rem;
  padding: .8rem 1rem;
  border: 1px solid var(--line-strong);
  font-family: var(--mono);
}
.signal-state.robust { border-color: var(--accent); }
.signal-state.mixed { border-color: #f9cc57; }
.signal-state.open { border-color: var(--orange); }
.signal-state span,
.signal-state small {
  display: block;
  color: var(--muted);
  font-size: .56rem;
  text-transform: uppercase;
  letter-spacing: .08em;
}
.signal-state strong {
  display: block;
  margin: .35rem 0;
  font-size: .82rem;
}
.date-rail {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
}
.date-rail button {
  flex: 0 0 auto;
  padding: .62rem .78rem;
  border: 0;
  border-right: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: .62rem var(--mono);
}
.date-rail button.active {
  background: var(--accent);
  color: var(--background);
}
.forecast-readout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(16rem, .85fr);
  gap: 1px;
  background: var(--line);
  border-bottom: 1px solid var(--line);
}
.forecast-readout > * {
  margin: 0;
  padding: 1.2rem;
  background: var(--background);
}
.forecast-readout span {
  color: var(--accent);
  font: .58rem var(--mono);
  text-transform: uppercase;
  letter-spacing: .1em;
}
.forecast-readout h4 {
  margin: .65rem 0 0;
  font: 500 clamp(1.35rem, 3vw, 2.45rem)/1.05 var(--mono);
  letter-spacing: -.055em;
}
.forecast-readout > p {
  color: var(--muted);
  line-height: 1.65;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  border-bottom: 1px solid var(--line);
}
.metric-grid article {
  min-width: 0;
  padding: 1rem;
  border-right: 1px solid var(--line);
}
.metric-grid article:last-child { border-right: 0; }
.metric-label {
  display: flex;
  align-items: center;
  gap: .4rem;
}
.metric-label > span {
  color: var(--muted);
  font: .56rem var(--mono);
  text-transform: uppercase;
  letter-spacing: .08em;
}
.metric-grid strong {
  display: block;
  margin: .7rem 0 .35rem;
  font: 500 1.45rem var(--mono);
}
.metric-grid p {
  margin: 0;
  color: var(--muted);
  font: .64rem/1.5 var(--mono);
}
.interpretation-ladder {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border-bottom: 1px solid var(--line);
}
.interpretation-ladder article {
  min-width: 0;
  padding: 1rem;
  border-right: 1px solid var(--line);
}
.interpretation-ladder article:last-child { border-right: 0; }
.interpretation-ladder span {
  color: var(--cyan);
  font: .55rem var(--mono);
  text-transform: uppercase;
  letter-spacing: .08em;
}
.interpretation-ladder strong {
  display: block;
  margin: .55rem 0 .35rem;
  font-size: .82rem;
}
.interpretation-ladder p {
  margin: 0;
  color: var(--muted);
  font-size: .68rem;
  line-height: 1.55;
}
.interpretation-ladder .isobar-verdict {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
.interpretation-ladder .limit {
  background: color-mix(in srgb, var(--orange) 5%, transparent);
}
.interpretation-ladder .comfort {
  margin-top: .65rem;
  padding-top: .65rem;
  border-top: 1px solid var(--line);
  color: var(--text);
}
.model-matrix {
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
}
.model-matrix > div {
  display: grid;
  grid-template-columns: 1.1fr repeat(5, minmax(6rem, 1fr));
  min-width: 48rem;
}
.model-matrix > div > * {
  padding: .65rem .8rem;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  font: .62rem var(--mono);
}
.matrix-head {
  color: var(--muted);
  text-transform: uppercase;
}
.model-matrix > p {
  margin: 0;
  padding: .7rem .8rem;
  color: var(--muted);
  font: .6rem var(--mono);
}
footer {
  display: flex;
  flex-wrap: wrap;
  gap: .65rem 1rem;
  padding: .75rem 1rem;
  color: var(--muted);
  font: .58rem var(--mono);
  text-transform: uppercase;
}
footer a {
  color: var(--cyan);
  text-decoration: none;
}
button:focus-visible,
a:focus-visible {
  outline: 1px solid var(--cyan);
  outline-offset: 2px;
}
@media (max-width: 1050px) {
  .metric-grid { grid-template-columns: repeat(2, 1fr); }
  .interpretation-ladder { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 720px) {
  .interpreter-head,
  .forecast-readout,
  .metric-grid,
  .interpretation-ladder {
    grid-template-columns: 1fr;
  }
  .signal-state { min-width: 0; }
  .metric-grid article,
  .interpretation-ladder article {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
</style>
