<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  availableInterpretationDates,
  buildForecastBriefing,
  coverageLabel,
} from '../lib/forecast-interpretation'
import type { ClimateDay } from '../types/evidence'
import type { Outlook } from '../types/outlook'
import type { InterpretationDomain, InterpretationInsight } from '../lib/forecast-interpretation'

type ReadingView = 'simple' | 'deep' | 'technical'

const props = withDefaults(defineProps<{
  outlook: Outlook
  selectedDate?: string
  climate?: ClimateDay | null
  climateLoading?: boolean
}>(), {
  selectedDate: '',
  climate: null,
  climateLoading: false,
})

const emit = defineEmits<{
  'update:selectedDate': [date: string]
}>()

const localDate = ref('')
const readingView = ref<ReadingView>('simple')
const dates = computed(() => availableInterpretationDates(props.outlook))
const activeDate = computed({
  get: () => props.selectedDate || localDate.value,
  set: (date: string) => {
    localDate.value = date
    emit('update:selectedDate', date)
  },
})

watch(
  () => `${props.outlook.refreshedAt}|${props.outlook.mode}|${dates.value.join(',')}|${props.selectedDate}`,
  () => {
    if (!dates.value.includes(activeDate.value)) {
      activeDate.value = dates.value[1] ?? dates.value[0] ?? ''
    }
  },
  { immediate: true },
)

const briefing = computed(() => buildForecastBriefing(
  props.outlook,
  activeDate.value,
  props.climate,
))

function findInsight(id: string) {
  return briefing.value?.sections
    .flatMap((section) => section.insights)
    .find((insight) => insight.id === id) ?? null
}

const temperatureInsight = computed(() =>
  findInsight('weather-temperature') ?? findInsight('weather-deterministic'))
const rainInsight = computed(() => findInsight('weather-rain'))
const comfortInsight = computed(() => findInsight('weather-comfort'))
const orientationInsight = computed(() =>
  findInsight('fusion-corridor') ?? findInsight('fusion-deterministic-spread'))
const scenarioInsight = computed(() => findInsight('scenario-paths') ?? findInsight('scenario-fragility'))
const climateInsight = computed(() => findInsight('climate-anomaly'))
const simpleHeadline = computed(() => temperatureInsight.value?.title
  .replace(' in der Modellmitte', '')
  .replace(' im Modellzentrum', '') ?? briefing.value?.headline ?? '')
const simpleLimit = computed(() => briefing.value?.mode === 'ensemble'
  ? 'Das ist eine verständliche Einordnung der aktuellen Modellrechnungen, keine Garantie. Je weiter der Tag entfernt ist, desto stärker kann sich das Bild noch ändern.'
  : 'Mehrere Modelle können ähnlich rechnen und trotzdem danebenliegen. Der Vergleich zeigt deshalb eine Richtung, keine Garantie.')

const simpleCards = computed(() => {
  const cards: Array<{ id: string; label: string; title: string; insight: InterpretationInsight }> = []
  if (rainInsight.value) cards.push({ id: 'rain', label: 'Niederschlag', title: 'Bleibt es eher trocken?', insight: rainInsight.value })
  if (comfortInsight.value) cards.push({ id: 'comfort', label: 'Empfinden', title: 'So könnte es sich anfühlen', insight: comfortInsight.value })
  if (scenarioInsight.value) cards.push({ id: 'scenario', label: 'Entwicklung', title: 'Kann sich die Lage noch drehen?', insight: scenarioInsight.value })
  if (climateInsight.value) cards.push({ id: 'climate', label: 'Historischer Vergleich', title: 'Ist das für diesen Tag ungewöhnlich?', insight: climateInsight.value })
  return cards
})

const visibleSections = computed(() => briefing.value?.sections.filter((section) => section.insights.length > 0) ?? [])
const missingDomains = computed(() => briefing.value?.coverage.unavailable ?? [])
const optionalMissingDomains = computed(() => missingDomains.value.filter((domain) =>
  ['scenario', 'climate', 'evidence'].includes(domain),
))

const domainLabels: Record<InterpretationDomain, string> = {
  weather: 'Wetterlage',
  fusion: 'Modellvergleich',
  scenario: 'Lauf- und Szenariovergleich',
  climate: 'historischer DWD-Vergleich',
  evidence: 'bisherige Verifikation',
  quality: 'Datenqualität',
}

function missingLabel(domains: InterpretationDomain[]) {
  return domains.map((domain) => domainLabels[domain]).join(', ')
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${date}T12:00:00`))
}

function number(value: number | null | undefined, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '—'
}
</script>

<template>
  <section v-if="briefing" class="interpreter" aria-label="ISOBAR Wetterbriefing">
    <header class="interpreter-head">
      <div>
        <p class="eyebrow">ISOBAR // Wetterbriefing</p>
        <h3>Was du aus den Daten mitnehmen kannst.</h3>
        <p>Erst die verständliche Einordnung. Fachbegriffe und Rechenwege bleiben freiwillig.</p>
      </div>
      <div class="signal-state" :class="briefing.status">
        <span>Orientierung</span>
        <strong>{{ orientationInsight?.title ?? 'Nur grobe Einordnung möglich' }}</strong>
        <small>keine Trefferquote</small>
      </div>
    </header>

    <nav class="date-rail" aria-label="Tag für Interpretation">
      <button
        v-for="date in dates"
        :key="date"
        type="button"
        :class="{ active: activeDate === date }"
        @click="activeDate = date"
      >
        {{ shortDate(date) }}
      </button>
    </nav>

    <div class="forecast-readout">
      <div>
        <span>{{ briefing.mode === 'models' ? '16-Tage-Modellvergleich' : '30-Tage-Ausblick' }} · {{ shortDate(briefing.date) }}</span>
        <h4>{{ simpleHeadline }}</h4>
        <p>{{ temperatureInsight?.simple ?? temperatureInsight?.plain }}</p>
      </div>
      <div class="orientation-copy">
        <span>Wie viel Spielraum bleibt?</span>
        <strong>{{ orientationInsight?.title ?? 'Zusatzanalyse fehlt' }}</strong>
        <p>{{ orientationInsight?.simple ?? orientationInsight?.plain ?? 'Die Wetterwerte sind vorhanden, eine zusätzliche Einordnung ihrer Bandbreite aber noch nicht.' }}</p>
      </div>
    </div>

    <div class="view-tabs" role="tablist" aria-label="Detailgrad der Erklärung">
      <button
        type="button"
        role="tab"
        :aria-selected="readingView === 'simple'"
        :class="{ active: readingView === 'simple' }"
        @click="readingView = 'simple'"
      >
        Überblick
        <small>das Wesentliche</small>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="readingView === 'deep'"
        :class="{ active: readingView === 'deep' }"
        @click="readingView = 'deep'"
      >
        Mehr Kontext
        <small>warum wir das so lesen</small>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="readingView === 'technical'"
        :class="{ active: readingView === 'technical' }"
        @click="readingView = 'technical'"
      >
        Methodik
        <small>Werte und Rechenwege</small>
      </button>
    </div>

    <div v-if="readingView === 'simple'" class="simple-reading" role="tabpanel">
      <article v-for="card in simpleCards" :key="card.id" :class="card.insight.tone">
        <span>{{ card.label }}</span>
        <h5>{{ card.title }}</h5>
        <p>{{ card.insight.simple ?? card.insight.plain }}</p>
      </article>

      <aside class="reading-limit">
        <span>Fair eingeordnet</span>
        <p>{{ simpleLimit }}</p>
      </aside>
    </div>

    <div v-else-if="readingView === 'deep'" class="deep-reading" role="tabpanel">
      <section v-for="section in visibleSections" :key="section.id" class="interpretation-section">
        <header>
          <div>
            <span>{{ section.kicker }}</span>
            <h5>{{ section.title }}</h5>
          </div>
        </header>
        <div class="insight-list">
          <article v-for="insight in section.insights" :key="insight.id" :class="insight.tone">
            <span>{{ insight.title }}</span>
            <p>{{ insight.plain }}</p>
            <aside v-if="insight.limitation"><strong>Was das nicht bedeutet</strong>{{ insight.limitation }}</aside>
          </article>
        </div>
      </section>

      <details v-if="optionalMissingDomains.length" class="optional-status">
        <summary>Noch nicht geladene Zusatzanalysen</summary>
        <p>{{ missingLabel(optionalMissingDomains) }} stehen in diesem Lauf nicht zur Verfügung und werden deshalb nicht als Inhaltskarten angezeigt.</p>
      </details>
    </div>

    <div v-else class="technical-reading" role="tabpanel">
      <section v-for="section in visibleSections" :key="section.id">
        <header>
          <div>
            <span>{{ section.id }} / {{ section.method }}</span>
            <h5>{{ section.title }}</h5>
          </div>
        </header>
        <article v-for="insight in section.insights" :key="insight.id" class="technical-insight">
          <div>
            <span>{{ insight.id }}</span>
            <strong>{{ insight.title }}</strong>
            <p>{{ insight.technical }}</p>
            <small v-if="insight.limitation">Grenze: {{ insight.limitation }}</small>
          </div>
          <dl>
            <div v-for="item in insight.evidence" :key="`${insight.id}-${item.label}`">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
              <code>{{ item.source }}</code>
            </div>
          </dl>
        </article>
      </section>

      <div v-if="briefing.modelRows.length" class="model-matrix">
        <div class="matrix-head">
          <span>Einzellauf</span><span>Minimum</span><span>Maximum</span><span>Gefühlt max.</span><span>Regen</span><span>RH Mittel</span>
        </div>
        <div v-for="row in briefing.modelRows" :key="row.id">
          <strong>{{ row.short }}</strong>
          <span>{{ number(row.temperatureMin) }} °C</span>
          <span>{{ number(row.temperatureMax) }} °C</span>
          <span>{{ number(row.apparentTemperatureMax) }} °C</span>
          <span>{{ number(row.precipitation) }} mm</span>
          <span>{{ number(row.relativeHumidityMean, 0) }} %</span>
        </div>
      </div>

      <footer class="technical-footer">
        <div><span>Engine</span><code>{{ briefing.method }}</code></div>
        <div><span>Vollständig</span><p>{{ coverageLabel(briefing.coverage.available) || '—' }}</p></div>
        <div><span>Teilweise</span><p>{{ coverageLabel(briefing.coverage.partial) || '—' }}</p></div>
        <div><span>Nicht geladen</span><p>{{ coverageLabel(briefing.coverage.unavailable) || '—' }}</p></div>
      </footer>
    </div>
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
.interpreter-head h3 { margin: .2rem 0 .45rem; font-size: clamp(1.45rem, 3vw, 2.35rem); font-weight: 500; letter-spacing: -.045em; }
.interpreter-head p:not(.eyebrow) { max-width: 52rem; margin: 0; color: var(--muted); line-height: 1.55; }
.signal-state { min-width: 14rem; padding: .8rem 1rem; border: 1px solid var(--line-strong); font-family: var(--mono); }
.signal-state.robust { border-color: var(--accent); }
.signal-state.mixed { border-color: #f9cc57; }
.signal-state.open, .signal-state.unknown { border-color: var(--orange); }
.signal-state span, .signal-state small,
.orientation-copy span, .simple-reading article > span,
.interpretation-section header span, .technical-reading header span,
.technical-insight > div > span, .reading-limit span, .technical-footer span {
  display: block;
  color: var(--muted);
  font: .56rem var(--mono);
  text-transform: uppercase;
  letter-spacing: .08em;
}
.signal-state strong { display: block; margin: .35rem 0; font-size: .82rem; }
.date-rail { display: flex; overflow-x: auto; border-bottom: 1px solid var(--line); }
.date-rail button { flex: 0 0 auto; padding: .62rem .78rem; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; font: .62rem var(--mono); }
.date-rail button.active { background: var(--accent); color: var(--background); }
.forecast-readout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(17rem, .8fr); gap: 1px; background: var(--line); border-bottom: 1px solid var(--line); }
.forecast-readout > div { padding: 1.2rem; background: var(--background); }
.forecast-readout > div:first-child > span { color: var(--accent); font: .58rem var(--mono); text-transform: uppercase; letter-spacing: .1em; }
.forecast-readout h4 { margin: .65rem 0 .45rem; font: 500 clamp(1.35rem, 3vw, 2.35rem)/1.05 var(--mono); letter-spacing: -.05em; }
.forecast-readout p, .orientation-copy p { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.6; }
.orientation-copy strong { display: block; margin: .55rem 0 .35rem; font: 500 1rem var(--mono); }
.view-tabs { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--line); }
.view-tabs button { padding: .85rem 1rem; border: 0; border-right: 1px solid var(--line); color: var(--muted); background: color-mix(in srgb, var(--background) 72%, transparent); cursor: pointer; text-align: left; font: 600 .72rem var(--mono); }
.view-tabs button:last-child { border-right: 0; }
.view-tabs button small { display: block; margin-top: .25rem; color: inherit; font-size: .52rem; font-weight: 400; text-transform: uppercase; }
.view-tabs button.active { color: var(--text); background: var(--surface-high); box-shadow: inset 0 -2px var(--cyan); }
.simple-reading { display: grid; grid-template-columns: repeat(2, 1fr); }
.simple-reading > article { min-height: 10rem; padding: 1.15rem; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.simple-reading > article:nth-of-type(2n) { border-right: 0; }
.simple-reading > article:last-of-type:nth-of-type(odd) { grid-column: 1 / -1; border-right: 0; }
.simple-reading > article.watch { background: color-mix(in srgb, #f9cc57 4%, transparent); }
.simple-reading > article.caution { background: color-mix(in srgb, var(--orange) 5%, transparent); }
.simple-reading h5, .interpretation-section h5, .technical-reading h5 { margin: .4rem 0 .55rem; font-size: 1rem; }
.simple-reading p, .insight-list p, .technical-insight p, .reading-limit p, .technical-footer p, .optional-status p { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.65; }
.optional-status { grid-column: 1 / -1; border-bottom: 1px solid var(--line); color: var(--muted); font: .62rem var(--mono); }
.optional-status summary { padding: .8rem 1.1rem; cursor: pointer; color: var(--muted); }
.optional-status p { padding: 0 1.1rem 1rem; max-width: 58rem; }
.reading-limit { grid-column: 1 / -1; padding: .9rem 1.1rem; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--orange) 5%, transparent); }
.reading-limit p { margin-top: .3rem; }
.interpretation-section { border-bottom: 1px solid var(--line); }
.interpretation-section > header, .technical-reading > section > header { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 1rem 1.2rem; }
.insight-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); border-top: 1px solid var(--line); }
.insight-list article { padding: 1rem 1.2rem; border-right: 1px solid var(--line); }
.insight-list article > span { color: var(--cyan); font: .62rem var(--mono); }
.insight-list article.watch > span { color: #f9cc57; }
.insight-list article.caution > span { color: var(--orange); }
.insight-list article.positive > span { color: var(--accent); }
.insight-list article p { margin-top: .45rem; }
.insight-list aside { margin-top: .75rem; padding-top: .65rem; border-top: 1px solid var(--line); color: var(--muted); font: .6rem/1.5 var(--mono); }
.insight-list aside strong { display: block; margin-bottom: .25rem; color: var(--orange); text-transform: uppercase; }
.technical-reading > section { border-bottom: 1px solid var(--line); }
.technical-insight { display: grid; grid-template-columns: minmax(16rem, .85fr) minmax(20rem, 1.15fr); border-top: 1px solid var(--line); }
.technical-insight > div { padding: 1rem 1.2rem; }
.technical-insight strong { display: block; margin: .4rem 0; font: 600 .78rem var(--mono); }
.technical-insight > div small { display: block; margin-top: .65rem; color: var(--orange); font: .58rem/1.5 var(--mono); }
.technical-insight dl { margin: 0; }
.technical-insight dl > div { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; padding: .65rem .8rem; border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); font: .6rem var(--mono); }
.technical-insight dt { color: var(--muted); }
.technical-insight dd { margin: 0; color: var(--text); }
.technical-insight code { grid-column: 1 / -1; color: color-mix(in srgb, var(--cyan) 72%, var(--muted)); font-size: .52rem; overflow-wrap: anywhere; }
.model-matrix { overflow-x: auto; border-bottom: 1px solid var(--line); }
.model-matrix > div { display: grid; grid-template-columns: 1.1fr repeat(5, minmax(6rem, 1fr)); min-width: 48rem; }
.model-matrix > div > * { padding: .65rem .8rem; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); font: .62rem var(--mono); }
.matrix-head { color: var(--muted); text-transform: uppercase; }
.technical-footer { display: grid; grid-template-columns: repeat(4, 1fr); }
.technical-footer > div { min-width: 0; padding: .75rem 1rem; border-right: 1px solid var(--line); }
.technical-footer > div:last-child { border-right: 0; }
.technical-footer code { color: var(--cyan); font: .6rem var(--mono); overflow-wrap: anywhere; }
.technical-footer p { margin-top: .25rem; font-size: .58rem; }
button:focus-visible, summary:focus-visible { outline: 1px solid var(--cyan); outline-offset: 2px; }
@media (max-width: 850px) {
  .interpreter-head, .forecast-readout, .technical-insight { grid-template-columns: 1fr; }
  .signal-state { min-width: 0; }
  .technical-footer { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .view-tabs, .simple-reading, .technical-footer { grid-template-columns: 1fr; }
  .simple-reading > article, .view-tabs button, .technical-footer > div { border-right: 0; }
}
</style>
