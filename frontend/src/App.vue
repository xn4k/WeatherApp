<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getForecast } from './api/weather'
import DailyForecast from './components/DailyForecast.vue'
import LocationSearch from './components/LocationSearch.vue'
import LongRangeLab from './components/LongRangeLab.vue'
import PaletteControl from './components/PaletteControl.vue'
import WeatherChart from './components/WeatherChart.vue'
import { usePalette } from './composables/usePalette'
import type { Forecast, LocationResult } from './types/weather'
import { formatTime, formatUpdated, weatherLabel, windDirection } from './lib/weather'

const { current: palette, automatic: automaticPalette, palettes, nextPalette, toggleAutomatic } =
  usePalette()

const defaultLocation: LocationResult = {
  id: 0,
  name: 'Köln',
  region: 'Nordrhein-Westfalen',
  country: 'Deutschland',
  latitude: 50.9991,
  longitude: 7.0387,
  timezone: 'Europe/Berlin',
}

const location = ref(defaultLocation)
const forecast = ref<Forecast | null>(null)
const loading = ref(true)
const error = ref('')
let controller: AbortController | undefined

const locationLine = computed(() =>
  [location.value.region, location.value.country].filter(Boolean).join(' · '),
)

const palettePosition = computed(
  () => palettes.findIndex((item) => item.id === palette.value.id) + 1,
)

const agreementText = computed(() => {
  const value = forecast.value?.consensus.agreement
  if (value === 'hoch') return 'Die Modelle liegen eng beieinander.'
  if (value === 'mittel') return 'Die Modelle zeigen erkennbare Unterschiede.'
  return 'Die Modellspanne ist groß; die Prognose ist unsicher.'
})

async function loadForecast() {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  try {
    forecast.value = await getForecast(
      location.value.latitude,
      location.value.longitude,
      location.value.name,
      controller.signal,
    )
  } catch (reason) {
    if ((reason as Error).name !== 'AbortError') {
      error.value = (reason as Error).message
    }
  } finally {
    loading.value = false
  }
}

function selectLocation(value: LocationResult) {
  location.value = value
  loadForecast()
}

onMounted(loadForecast)
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a href="/" class="brand" aria-label="ISOBAR Startseite">
        <span class="brand-mark"><i></i><i></i><i></i></span>
        <span>ISOBAR</span>
      </a>
      <p class="claim"><span></span>Daten statt Drama</p>
      <PaletteControl
        :palette="palette"
        :automatic="automaticPalette"
        :position="palettePosition"
        :total="palettes.length"
        @next="nextPalette"
        @toggle="toggleAutomatic"
      />
      <LocationSearch @select="selectLocation" />
    </header>

    <main>
      <div v-if="loading && !forecast" class="loading-state">
        <span class="loading-orbit"></span>
        <p>Modelldaten werden abgeglichen</p>
        <small>ICON · IFS · GFS</small>
      </div>

      <section v-else-if="error && !forecast" class="error-state">
        <p class="eyebrow">Keine belastbaren Daten</p>
        <h1>Die Wetterquellen antworten gerade nicht.</h1>
        <p>{{ error }}</p>
        <button type="button" @click="loadForecast">Erneut versuchen</button>
      </section>

      <template v-else-if="forecast">
        <section class="current-section">
          <div class="location-heading">
            <p class="eyebrow">Aktuelle Modelllage</p>
            <h1>{{ location.name }}</h1>
            <p>{{ locationLine }}</p>
          </div>

          <div class="current-reading">
            <span class="temperature">{{ forecast.current.temperature.toFixed(1) }}<sup>°C</sup></span>
            <div>
              <strong>{{ weatherLabel(forecast.current.weatherCode) }}</strong>
              <span>Gefühlt {{ forecast.current.apparentTemperature.toFixed(1) }} °C</span>
            </div>
          </div>

          <div class="data-status">
            <span :class="{ stale: forecast.stale }">
              {{ forecast.stale ? 'Ältere Daten' : 'Aktualisiert' }}
            </span>
            <strong>{{ formatUpdated(forecast.updatedAt) }} Uhr</strong>
            <button type="button" :disabled="loading" @click="loadForecast">
              {{ loading ? 'Lädt …' : 'Neu laden' }}
            </button>
          </div>
        </section>

        <section class="facts-grid" aria-label="Aktuelle Wetterwerte">
          <article>
            <span>Luftfeuchte</span>
            <strong>{{ Math.round(forecast.current.humidity) }}<small>%</small></strong>
            <i :style="{ '--fill': `${forecast.current.humidity}%` }"></i>
          </article>
          <article>
            <span>Wind</span>
            <strong>{{ Math.round(forecast.current.windSpeed) }}<small>km/h</small></strong>
            <p>{{ windDirection(forecast.current.windDirection) }} · Böen {{ Math.round(forecast.current.windGusts) }}</p>
          </article>
          <article>
            <span>Luftdruck</span>
            <strong>{{ Math.round(forecast.current.pressure) }}<small>hPa</small></strong>
            <p>Am Standort, nicht auf Meereshöhe</p>
          </article>
          <article>
            <span>Sonne</span>
            <strong>{{ formatTime(forecast.daily[0]?.sunset) }}<small>Untergang</small></strong>
            <p>Aufgang {{ formatTime(forecast.daily[0]?.sunrise) }}</p>
          </article>
        </section>

        <WeatherChart :models="forecast.models" :current-time="forecast.current.time" />

        <section class="model-panel panel">
          <div class="model-intro">
            <p class="eyebrow">Einordnung, keine Schlagzeile</p>
            <h2>Was die Modelle tatsächlich sagen</h2>
            <p>
              Erwartete Höchsttemperatur heute
              <strong>{{ forecast.consensus.todayMax.toFixed(1) }} °C</strong>.
              Die Modellspanne beträgt
              <strong>{{ forecast.consensus.maxSpread.toFixed(1) }} K</strong>.
              {{ agreementText }}
            </p>
          </div>
          <div class="agreement">
            <span>Übereinstimmung</span>
            <strong>{{ forecast.consensus.agreement }}</strong>
            <div class="agreement-scale">
              <i :class="{ active: forecast.consensus.agreement === 'niedrig' }"></i>
              <i :class="{ active: forecast.consensus.agreement === 'mittel' }"></i>
              <i :class="{ active: forecast.consensus.agreement === 'hoch' }"></i>
            </div>
          </div>
          <div class="model-table">
            <div class="table-head">
              <span>Modell</span><span>Tief</span><span>Hoch</span><span>Regen 6 h</span>
            </div>
            <div v-for="model in forecast.modelSummaries" :key="model.id">
              <strong>{{ model.label }}</strong>
              <span>{{ model.todayMin.toFixed(1) }}°</span>
              <span>{{ model.todayMax.toFixed(1) }}°</span>
              <span>{{ Math.round(model.nextSixHourRain) }}%</span>
            </div>
          </div>
        </section>

        <LongRangeLab
          :key="`${forecast.coordinates.latitude}:${forecast.coordinates.longitude}`"
          :latitude="forecast.coordinates.latitude"
          :longitude="forecast.coordinates.longitude"
        />

        <DailyForecast :days="forecast.daily" />

        <footer>
          <div class="brand footer-brand">
            <span class="brand-mark"><i></i><i></i><i></i></span>
            <span>ISOBAR</span>
          </div>
          <p>Wettermodelle und Geodaten: Open-Meteo. Prognosen sind keine Messwerte.</p>
          <p>Keine Werbung. Keine Panik. Nur die Lage.</p>
        </footer>
      </template>
    </main>
  </div>
</template>

