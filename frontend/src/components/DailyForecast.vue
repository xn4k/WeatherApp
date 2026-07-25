<script setup lang="ts">
import type { DailyPoint } from '../types/weather'
import { weatherLabel } from '../lib/weather'

defineProps<{ days: DailyPoint[] }>()

function weekday(value: string, index: number) {
  if (index === 0) return 'Heute'
  if (index === 1) return 'Morgen'
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(new Date(`${value}T12:00:00`))
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(
    new Date(`${value}T12:00:00`),
  )
}
</script>

<template>
  <section class="daily-panel panel">
    <header class="panel-header">
      <div>
        <p class="eyebrow">10 Tage · Modellmedian</p>
        <h2>Der ruhige Blick nach vorn</h2>
      </div>
      <p class="panel-note">Mit zunehmender Entfernung steigt die Unsicherheit.</p>
    </header>
    <div class="days">
      <article v-for="(day, index) in days" :key="day.date" class="day">
        <div class="day-heading">
          <strong>{{ weekday(day.date, index) }}</strong>
          <span>{{ dateLabel(day.date) }}</span>
        </div>
        <div class="condition-mark" :class="{ wet: day.precipitationProbability >= 50 }">
          <span></span>
        </div>
        <p>{{ weatherLabel(day.weatherCode) }}</p>
        <div class="temperatures">
          <strong>{{ Math.round(day.temperatureMax) }}°</strong>
          <span>{{ Math.round(day.temperatureMin) }}°</span>
        </div>
        <dl>
          <div>
            <dt>Regen</dt>
            <dd>{{ Math.round(day.precipitationProbability) }}%</dd>
          </div>
          <div>
            <dt>Menge</dt>
            <dd>{{ day.precipitation.toFixed(1) }} mm</dd>
          </div>
          <div>
            <dt>Wind</dt>
            <dd>{{ Math.round(day.windSpeedMax) }} km/h</dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>

