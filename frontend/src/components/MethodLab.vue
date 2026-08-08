<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Outlook } from '../types/outlook'

const props = defineProps<{ outlook: Outlook }>()

const expanded = ref(false)
const slideIndex = ref(0)
const showCode = ref(false)
const selectedQuantile = ref(2)
const demoForecast = ref(24)
const demoObserved = ref(21)
const demoProbability = ref(70)
const demoEvent = ref(true)
const selectedProvider = ref(0)

const slides = [
  {
    id: 'quantiles',
    index: '01',
    short: 'Quantile',
    title: 'Nicht eine Zahl. Eine Verteilung.',
    description: 'P10 bis P90 zeigen den modellierten Möglichkeitsraum. P50 ist der Median – nicht automatisch die Wahrheit.',
    code: `const p50 = weightedQuantile(members, 0.50)\nconst corridor = [\n  weightedQuantile(members, 0.10),\n  weightedQuantile(members, 0.90),\n]`,
  },
  {
    id: 'weights',
    index: '02',
    short: 'Gewichte',
    title: 'Viele Member sind nicht viele Modelle.',
    description: 'Jedes Modell erhält zunächst dasselbe Gesamtgewicht. Seine Ensemblemitglieder teilen sich dieses Gewicht.',
    code: `modelWeight = 1 / availableModels\nmemberWeight = modelWeight / model.members.length`,
  },
  {
    id: 'scores',
    index: '03',
    short: 'Scores',
    title: 'Vorhersagen müssen sich prüfen lassen.',
    description: 'MAE misst einen absoluten Fehler. Der Brier Score bestraft selbstbewusste, aber falsche Ereigniswahrscheinlichkeiten besonders stark.',
    code: `mae = Math.abs(forecast - reference)\nbrier = (probability - outcome) ** 2`,
  },
  {
    id: 'learning',
    index: '04',
    short: 'Lernphase',
    title: 'Kein Lernen ohne Vergangenheit.',
    description: 'ISOBAR aktiviert Skill-Gewichte erst mit genügend verschiedenen Verifikationstagen. Bis dahin bleibt die neutrale Fusion aktiv.',
    code: `if (distinctDays < 14) {\n  return equalModelWeights\n}\nreturn shrinkAndClamp(skillWeights, 0.5, 2.0)`,
  },
  {
    id: 'providers',
    index: '05',
    short: 'Anbieter',
    title: 'Gleiche Temperatur heißt nicht gleiche Quelle.',
    description: '36,7 °C bei zwei Apps ist kein Beweis für dasselbe Modell. Rundung, Laufzeitpunkt und proprietäre Nachbearbeitung können denselben Wert erzeugen.',
    code: `sameDisplayedValue !== sameForecastModel\n// Herkunft nur mit veröffentlichter Methodik zuordnen`,
  },
] as const

const activeSlide = computed(() => slides[slideIndex.value])
const fusionDay = computed(() => props.outlook.fusion?.daily[1] ?? props.outlook.fusion?.daily[0])
const quantiles = computed(() => {
  const day = fusionDay.value
  return day ? [
    { label: 'P10', value: day.temperatureP10 },
    { label: 'P25', value: day.temperatureP25 },
    { label: 'P50', value: day.temperatureP50 },
    { label: 'P75', value: day.temperatureP75 },
    { label: 'P90', value: day.temperatureP90 },
  ] : [
    { label: 'P10', value: 16 },
    { label: 'P25', value: 19 },
    { label: 'P50', value: 22 },
    { label: 'P75', value: 25 },
    { label: 'P90', value: 29 },
  ]
})
const quantileMinimum = computed(() => quantiles.value[0].value)
const quantileMaximum = computed(() => quantiles.value.at(-1)?.value ?? quantileMinimum.value)
const quantilePosition = (value: number) => {
  const range = quantileMaximum.value - quantileMinimum.value
  return range ? ((value - quantileMinimum.value) / range) * 100 : 50
}

const fusionModels = computed(() => {
  const ensembles = (props.outlook.ensembles ?? []).filter((model) => model.id !== 'ec46')
  if (ensembles.length) return ensembles
  return (props.outlook.models ?? []).map((model) => ({
    id: model.id,
    short: model.short,
    memberCount: 1,
  }))
})
const equalModelWeight = computed(() => fusionModels.value.length ? 100 / fusionModels.value.length : 0)
const calibration = computed(() => props.outlook.calibration)
const calibrationProgress = computed(() => {
  const value = calibration.value
  return value ? Math.min(100, (value.distinctDays / value.minimumDays) * 100) : 0
})
const mae = computed(() => Math.abs(demoForecast.value - demoObserved.value))
const brier = computed(() => {
  const probability = demoProbability.value / 100
  return (probability - (demoEvent.value ? 1 : 0)) ** 2
})

const providers = [
  {
    name: 'Apple Weather',
    product: 'iPhone · WeatherKit',
    disclosure: 'teilweise offengelegt',
    tone: 'partial',
    headline: 'Mehrere Modelllieferanten, keine öffentliche Einzelwert-Zuordnung',
    detail: 'Apple nennt unter anderem NOAA, DWD, Met Office/ECMWF, JMA und Météo-France als Wettermodellquellen. Wie diese für einen konkreten Temperaturwert gewichtet oder nachbearbeitet werden, wird nicht veröffentlicht.',
    source: 'Apple WeatherKit · Data Sources',
    href: 'https://developer.apple.com/weatherkit/data-source-attribution/',
  },
  {
    name: 'Google Weather',
    product: 'Google Search · Pixel Weather',
    disclosure: 'System beschrieben',
    tone: 'partial',
    headline: 'Interne Fusion aus Modellen, Beobachtungen und KI',
    detail: 'Google beschreibt ein internes Vorhersagesystem mit Daten globaler Wetterdienste. Die Weather API kombiniert klassische und KI-basierte Systeme; ein angezeigter Wert ist daher nicht einfach „GFS“ oder WeatherNext 2.',
    source: 'Google · How Weather works',
    href: 'https://support.google.com/websearch/answer/13687874',
  },
  {
    name: 'Android / Geräte-Apps',
    product: 'Samsung · Pixel · Drittanbieter',
    disclosure: 'app-abhängig',
    tone: 'unknown',
    headline: 'Android ist die Plattform, nicht ein Wetteranbieter',
    detail: 'Die Quelle hängt von der installierten App und dem Gerätehersteller ab. Pixel Weather verwendet Googles Wetterprodukt; andere Android-Apps können vollständig andere Anbieter einsetzen.',
    source: 'Google Pixel Weather Help',
    href: 'https://support.google.com/pixelphone/answer/15266029',
  },
  {
    name: 'weather.com',
    product: 'The Weather Channel',
    disclosure: 'System beschrieben',
    tone: 'documented',
    headline: 'GRAF + WxMix + mehr als 100 Modelle',
    detail: 'The Weather Company dokumentiert das eigene GRAF-System, das WxMix-Multi-Modell-Ensemble, proprietäre Daten und menschliche meteorologische Kontrolle. Auch weather.com ist damit kein einzelner GFS-Output.',
    source: 'The Weather Company · Forecast Methodology',
    href: 'https://www.weathercompany.com/proven-accuracy/',
  },
  {
    name: 'ISOBAR',
    product: '30-Tage-Fusion',
    disclosure: 'offen dokumentiert',
    tone: 'documented',
    headline: 'Modelle, Member, Formeln und Lernstatus sichtbar',
    detail: 'ICON-EU, IFS ENS, AIFS ENS, GEFS und WeatherNext 2 fließen transparent ein. EC46 bleibt separat. Aktive Gewichte, Stichprobe und Grenzen werden im Interface ausgewiesen.',
    source: 'ISOBAR · Verification Method',
    href: 'https://github.com/xn4k/WeatherApp/blob/master/docs/VERIFICATION.md',
  },
] as const

function move(direction: number) {
  slideIndex.value = (slideIndex.value + direction + slides.length) % slides.length
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') move(-1)
  if (event.key === 'ArrowRight') move(1)
}

watch(slideIndex, () => {
  showCode.value = false
})
</script>

<template>
  <section class="method-lab panel" :class="{ expanded }">
    <header class="lab-header">
      <div>
        <p class="eyebrow">ISOBAR // Method Lab</p>
        <h3>Die Mathematik darf sichtbar sein.</h3>
        <p>Interaktive Experimente zu Quantilen, Gewichten, Verifikation und den Methoden großer Wetteranbieter.</p>
      </div>
      <button type="button" class="nerd-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
        <span>{{ expanded ? 'Nerd Mode schließen' : 'Nerd Mode starten' }}</span>
        <i aria-hidden="true">{{ expanded ? '−' : '+' }}</i>
      </button>
    </header>

    <div v-if="expanded" class="lab-shell" tabindex="0" @keydown="handleKey">
      <nav class="slide-nav" aria-label="Methoden-Kapitel">
        <button
          v-for="(slide, index) in slides"
          :key="slide.id"
          type="button"
          :class="{ active: index === slideIndex }"
          @click="slideIndex = index"
        >
          <span>{{ slide.index }}</span>
          {{ slide.short }}
        </button>
      </nav>

      <article class="slide-stage">
        <div class="slide-copy">
          <span class="slide-index">{{ activeSlide.index }} / {{ String(slides.length).padStart(2, '0') }}</span>
          <h4>{{ activeSlide.title }}</h4>
          <p>{{ activeSlide.description }}</p>
          <button type="button" class="code-toggle" :aria-expanded="showCode" @click="showCode = !showCode">
            {{ showCode ? 'Code ausblenden' : 'Pseudocode ansehen' }}
          </button>
          <pre v-if="showCode"><code>{{ activeSlide.code }}</code></pre>
        </div>

        <div class="experiment">
          <div v-if="activeSlide.id === 'quantiles'" class="quantile-demo">
            <div class="demo-meta">
              <span>{{ fusionDay ? 'Live aus aktueller Fusion' : 'Illustratives Beispiel' }}</span>
              <strong>{{ quantiles[selectedQuantile].value.toFixed(1) }} °C</strong>
            </div>
            <div class="quantile-track">
              <div class="quantile-band"></div>
              <button
                v-for="(quantile, index) in quantiles"
                :key="quantile.label"
                type="button"
                :class="{ active: selectedQuantile === index }"
                :style="{ left: `${quantilePosition(quantile.value)}%` }"
                @click="selectedQuantile = index"
              >
                <i></i><span>{{ quantile.label }}</span><small>{{ quantile.value.toFixed(1) }}°</small>
              </button>
            </div>
            <p>P10–P90 umfasst 80 % der modellierten Verteilung. Extremere Entwicklungen bleiben trotzdem möglich.</p>
          </div>

          <div v-else-if="activeSlide.id === 'weights'" class="weight-demo">
            <div class="weight-summary">
              <span>Neutrales Gewicht je Modell</span>
              <strong>{{ equalModelWeight.toFixed(1) }} %</strong>
              <small>{{ fusionModels.length || 0 }} verfügbare Fusionsmodelle</small>
            </div>
            <div class="weight-models">
              <article v-for="model in fusionModels" :key="model.id">
                <span>{{ model.short }}</span>
                <strong>{{ model.memberCount }}</strong>
                <small>Member teilen {{ equalModelWeight.toFixed(1) }} %</small>
                <div><i :style="{ width: `${equalModelWeight}%` }"></i></div>
              </article>
            </div>
          </div>

          <div v-else-if="activeSlide.id === 'scores'" class="score-demo">
            <article>
              <div><span>Temperaturprognose</span><strong>{{ demoForecast }} °C</strong></div>
              <input v-model.number="demoForecast" type="range" min="-5" max="40" aria-label="Beispielprognose Temperatur">
              <div><span>Referenzwert</span><strong>{{ demoObserved }} °C</strong></div>
              <input v-model.number="demoObserved" type="range" min="-5" max="40" aria-label="Beispielreferenz Temperatur">
              <output>MAE <strong>{{ mae.toFixed(1) }} K</strong></output>
            </article>
            <article>
              <div><span>Regenwahrscheinlichkeit</span><strong>{{ demoProbability }} %</strong></div>
              <input v-model.number="demoProbability" type="range" min="0" max="100" aria-label="Beispiel Regenwahrscheinlichkeit">
              <button type="button" class="event-toggle" @click="demoEvent = !demoEvent">
                Ereignis: <strong>{{ demoEvent ? 'Regen' : 'kein Regen' }}</strong>
              </button>
              <output>Brier Score <strong>{{ brier.toFixed(3) }}</strong></output>
            </article>
          </div>

          <div v-else-if="activeSlide.id === 'learning'" class="learning-demo">
            <div class="learning-orbit" :style="{ '--progress': `${calibrationProgress * 3.6}deg` }">
              <div>
                <strong>{{ calibration?.distinctDays ?? 0 }}</strong>
                <span>/ {{ calibration?.minimumDays ?? 14 }} Tage</span>
              </div>
            </div>
            <div class="learning-readout">
              <span :class="['status-pill', calibration?.status ?? 'collecting']">
                {{ calibration?.status === 'active' ? 'Skill aktiv' : 'Daten sammeln' }}
              </span>
              <strong>{{ calibration?.scoredForecasts ?? 0 }} bewertete Modellprognosen</strong>
              <p>{{ calibration?.notice ?? 'Für diesen Standort liegt noch kein zentraler Kalibrierungsstatus vor.' }}</p>
            </div>
          </div>

          <div v-else class="provider-demo">
            <div class="provider-list" role="list" aria-label="Transparenz der Wetteranbieter">
              <button
                v-for="(provider, index) in providers"
                :key="provider.name"
                type="button"
                :class="{ active: selectedProvider === index }"
                @click="selectedProvider = index"
              >
                <span>{{ provider.name }}</span>
                <small :class="provider.tone">{{ provider.disclosure }}</small>
              </button>
            </div>
            <article class="provider-detail">
              <span>{{ providers[selectedProvider].product }}</span>
              <h5>{{ providers[selectedProvider].headline }}</h5>
              <p>{{ providers[selectedProvider].detail }}</p>
              <a :href="providers[selectedProvider].href" target="_blank" rel="noreferrer">
                Primärquelle: {{ providers[selectedProvider].source }} ↗
              </a>
            </article>
          </div>
        </div>
      </article>

      <footer class="lab-controls">
        <button type="button" aria-label="Vorheriges Kapitel" @click="move(-1)">← Zurück</button>
        <div aria-hidden="true">
          <i v-for="(slide, index) in slides" :key="slide.id" :class="{ active: index === slideIndex }"></i>
        </div>
        <button type="button" aria-label="Nächstes Kapitel" @click="move(1)">Weiter →</button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.method-lab { position: relative; margin-top: 1rem; padding: 0; overflow: hidden; background: radial-gradient(circle at 95% 0%, color-mix(in srgb, var(--cyan) 9%, transparent), transparent 28rem), var(--surface); }
.lab-header { display: flex; align-items: end; justify-content: space-between; gap: 2rem; padding: clamp(1rem, 3vw, 1.7rem); }
.lab-header > div { max-width: 47rem; }
.lab-header h3 { margin: .25rem 0 .45rem; font-size: clamp(1.5rem, 3vw, 2.65rem); font-weight: 500; letter-spacing: -.05em; }
.lab-header p:not(.eyebrow) { margin: 0; color: var(--muted); line-height: 1.55; }
.nerd-toggle { display: flex; min-width: 12.5rem; justify-content: space-between; align-items: center; gap: 1rem; padding: .8rem 1rem; border: 1px solid var(--line-strong); background: var(--background); color: var(--text); font: .68rem var(--mono); text-transform: uppercase; cursor: pointer; }
.nerd-toggle i { color: var(--cyan); font: normal 1.3rem var(--mono); }
.lab-shell { border-top: 1px solid var(--line); outline: none; }
.lab-shell:focus-visible { outline: 1px solid var(--cyan); outline-offset: -2px; }
.slide-nav { display: grid; grid-template-columns: repeat(5, 1fr); border-bottom: 1px solid var(--line); }
.slide-nav button { display: flex; gap: .55rem; align-items: center; padding: .75rem 1rem; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); font: .64rem var(--mono); text-transform: uppercase; cursor: pointer; }
.slide-nav button:last-child { border-right: 0; }
.slide-nav button span { color: var(--line-strong); }
.slide-nav button.active { color: var(--text); background: color-mix(in srgb, var(--cyan) 7%, transparent); box-shadow: inset 0 -2px var(--cyan); }
.slide-nav button.active span { color: var(--cyan); }
.slide-stage { display: grid; grid-template-columns: minmax(15rem, .72fr) minmax(0, 1.5fr); min-height: 25rem; }
.slide-copy { padding: clamp(1.2rem, 3vw, 2rem); border-right: 1px solid var(--line); }
.slide-index { color: var(--cyan); font: .62rem var(--mono); letter-spacing: .12em; }
.slide-copy h4 { margin: 1.2rem 0 .75rem; font-size: clamp(1.65rem, 3vw, 2.8rem); font-weight: 500; line-height: 1.02; letter-spacing: -.055em; }
.slide-copy > p { color: var(--muted); line-height: 1.65; }
.code-toggle { margin-top: 1rem; padding: .55rem .7rem; border: 1px solid var(--line); background: transparent; color: var(--cyan); font: .62rem var(--mono); cursor: pointer; }
pre { margin: .8rem 0 0; padding: .9rem; overflow: auto; border: 1px solid var(--line); background: var(--background); color: var(--text); font: .68rem/1.65 var(--mono); }
.experiment { min-width: 0; display: grid; align-items: stretch; padding: clamp(1rem, 3vw, 1.6rem); }
.quantile-demo, .weight-demo, .score-demo, .learning-demo, .provider-demo { min-width: 0; }
.demo-meta { display: flex; align-items: end; justify-content: space-between; }
.demo-meta span, .weight-summary span, .weight-summary small { color: var(--muted); font: .6rem var(--mono); text-transform: uppercase; }
.demo-meta strong { font: 500 clamp(1.8rem, 4vw, 3.6rem) var(--mono); letter-spacing: -.07em; }
.quantile-track { position: relative; height: 10rem; margin: 2.5rem 1.8rem 1rem; }
.quantile-track::before { content: ''; position: absolute; left: 0; right: 0; top: 3.15rem; height: 1px; background: var(--line-strong); }
.quantile-band { position: absolute; left: 0; right: 0; top: 2.7rem; height: .9rem; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--cyan) 35%, transparent) 20%, color-mix(in srgb, var(--accent) 55%, transparent) 50%, color-mix(in srgb, var(--cyan) 35%, transparent) 80%, transparent); }
.quantile-track button { position: absolute; top: 1.6rem; width: 4.4rem; transform: translateX(-50%); border: 0; background: transparent; color: var(--muted); cursor: pointer; font-family: var(--mono); }
.quantile-track button i { display: block; width: .7rem; height: .7rem; margin: 1.2rem auto .65rem; border: 1px solid var(--cyan); border-radius: 50%; background: var(--surface); transition: transform .16s, background .16s; }
.quantile-track button span, .quantile-track button small { display: block; }
.quantile-track button span { font-size: .62rem; }
.quantile-track button small { margin-top: .25rem; font-size: .7rem; }
.quantile-track button.active { color: var(--text); }
.quantile-track button.active i { transform: scale(1.55); background: var(--cyan); box-shadow: 0 0 14px color-mix(in srgb, var(--cyan) 65%, transparent); }
.quantile-demo > p { color: var(--muted); font-size: .72rem; line-height: 1.6; }
.weight-demo { display: grid; grid-template-columns: .75fr 1.5fr; gap: 1px; background: var(--line); border: 1px solid var(--line); }
.weight-summary, .weight-models { background: var(--background); padding: 1rem; }
.weight-summary strong { display: block; margin: 1rem 0 .35rem; color: var(--accent); font: 500 clamp(2rem, 5vw, 4.5rem) var(--mono); letter-spacing: -.08em; }
.weight-models { display: grid; grid-template-columns: repeat(2, 1fr); gap: .6rem; }
.weight-models article { padding: .7rem; border: 1px solid var(--line); }
.weight-models span, .weight-models small { display: block; color: var(--muted); font: .58rem var(--mono); text-transform: uppercase; }
.weight-models strong { display: block; margin: .35rem 0; font: 500 1.3rem var(--mono); }
.weight-models article > div { height: 2px; margin-top: .6rem; background: var(--line); }
.weight-models article > div i { display: block; height: 100%; background: var(--cyan); }
.score-demo { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; border: 1px solid var(--line); background: var(--line); }
.score-demo article { display: flex; flex-direction: column; gap: .75rem; padding: 1rem; background: var(--background); }
.score-demo article > div { display: flex; justify-content: space-between; gap: 1rem; color: var(--muted); font: .62rem var(--mono); text-transform: uppercase; }
.score-demo input { width: 100%; accent-color: var(--cyan); }
.score-demo output { margin-top: auto; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font: .65rem var(--mono); text-transform: uppercase; }
.score-demo output strong { display: block; margin-top: .45rem; color: var(--accent); font-size: 1.8rem; }
.event-toggle { padding: .7rem; border: 1px solid var(--line); background: transparent; color: var(--muted); font: .65rem var(--mono); cursor: pointer; }
.event-toggle strong { color: var(--text); }
.learning-demo { display: grid; grid-template-columns: .8fr 1.2fr; place-items: center; gap: 2rem; }
.learning-orbit { display: grid; place-items: center; width: min(14rem, 100%); aspect-ratio: 1; border-radius: 50%; background: conic-gradient(var(--cyan) var(--progress), var(--line) 0); padding: 1px; }
.learning-orbit > div { display: grid; place-content: center; width: calc(100% - 1.1rem); aspect-ratio: 1; border-radius: 50%; background: var(--background); text-align: center; }
.learning-orbit strong { font: 500 3rem var(--mono); }
.learning-orbit span { color: var(--muted); font: .65rem var(--mono); }
.learning-readout strong { display: block; margin: 1rem 0 .6rem; font: 500 1.2rem var(--mono); }
.learning-readout p { color: var(--muted); line-height: 1.65; }
.status-pill { display: inline-flex; padding: .35rem .5rem; border: 1px solid var(--line); color: var(--muted); font: .6rem var(--mono); text-transform: uppercase; }
.status-pill.active { color: var(--accent); border-color: var(--accent); }
.provider-demo { display: grid; grid-template-columns: .8fr 1.3fr; border: 1px solid var(--line); }
.provider-list { border-right: 1px solid var(--line); }
.provider-list button { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: .75rem; padding: .75rem; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--muted); text-align: left; cursor: pointer; font: .64rem var(--mono); }
.provider-list button:last-child { border-bottom: 0; }
.provider-list button.active { color: var(--text); background: var(--surface-high); box-shadow: inset 2px 0 var(--cyan); }
.provider-list small { font-size: .5rem; text-transform: uppercase; }
.provider-list small.documented { color: var(--accent); }
.provider-list small.partial { color: var(--orange); }
.provider-list small.unknown { color: var(--muted); }
.provider-detail { padding: 1.2rem; }
.provider-detail > span { color: var(--cyan); font: .58rem var(--mono); text-transform: uppercase; }
.provider-detail h5 { margin: .7rem 0; font-size: clamp(1.2rem, 2.4vw, 2rem); font-weight: 500; letter-spacing: -.04em; }
.provider-detail p { color: var(--muted); line-height: 1.65; }
.provider-detail a { display: inline-flex; margin-top: .8rem; color: var(--cyan); font: .62rem var(--mono); text-decoration: none; }
.lab-controls { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); }
.lab-controls button { padding: .75rem 1rem; border: 0; background: transparent; color: var(--muted); font: .62rem var(--mono); cursor: pointer; }
.lab-controls button:hover { color: var(--text); }
.lab-controls > div { display: flex; gap: .35rem; }
.lab-controls i { width: 1.2rem; height: 2px; background: var(--line-strong); }
.lab-controls i.active { background: var(--cyan); }
button:focus-visible, a:focus-visible { outline: 1px solid var(--cyan); outline-offset: 2px; }
@media (max-width: 900px) {
  .slide-stage { grid-template-columns: 1fr; }
  .slide-copy { border-right: 0; border-bottom: 1px solid var(--line); }
  .slide-nav { grid-template-columns: repeat(5, minmax(7rem, 1fr)); overflow-x: auto; }
}
@media (max-width: 680px) {
  .lab-header { align-items: stretch; flex-direction: column; }
  .nerd-toggle { width: 100%; }
  .weight-demo, .score-demo, .learning-demo, .provider-demo { grid-template-columns: 1fr; }
  .provider-list { border-right: 0; border-bottom: 1px solid var(--line); }
  .weight-models { grid-template-columns: 1fr; }
  .quantile-track { margin-inline: 2.2rem; }
}
</style>
