<script setup lang="ts">
import type { CalibrationStatus } from '../types/outlook'

defineProps<{ calibration: CalibrationStatus }>()

const bucketLabels: Record<string, string> = {
  'days-0-3': 'Tag 0–3',
  'days-4-7': 'Tag 4–7',
  'days-8-15': 'Tag 8–15',
  'days-16-30': 'Tag 16–30',
}
</script>

<template>
  <section class="calibration" aria-label="Historische Modellverifikation">
    <div class="calibration-lead">
      <span>ISOBAR // Skill Engine</span>
      <strong>{{ calibration.status === 'active' ? 'Skill-Gewichte aktiv' : 'Lernphase aktiv' }}</strong>
      <small>Referenzanalyse · keine Stationsmessung</small>
    </div>
    <article>
      <span>Verifikationstage</span>
      <strong>{{ calibration.distinctDays }}<small>/ {{ calibration.minimumDays }}</small></strong>
      <p>Mindestbasis pro Modell und Horizont</p>
    </article>
    <article>
      <span>Bewertete Modellprognosen</span>
      <strong>{{ calibration.scoredForecasts }}</strong>
      <p>MAE · CRPS · Brier</p>
    </article>
    <article>
      <span>Aktive Horizonte</span>
      <strong>{{ calibration.activeBuckets.length }}</strong>
      <p>
        {{ calibration.activeBuckets.map((bucket) => bucketLabels[bucket] ?? bucket).join(' · ') || 'noch gleichgewichtet' }}
      </p>
    </article>
    <p class="calibration-notice">{{ calibration.notice }}</p>
  </section>
</template>

<style scoped>
.calibration {
  display: grid;
  grid-template-columns: 1.45fr repeat(3, 1fr);
  margin: 0 0 .8rem;
  border: 1px solid var(--line);
  background: linear-gradient(110deg, color-mix(in srgb, var(--cyan) 5%, transparent), transparent 55%);
}
.calibration > div,
.calibration article {
  min-width: 0;
  padding: .85rem 1rem;
  border-right: 1px solid var(--line);
}
.calibration article:nth-of-type(3) { border-right: 0; }
.calibration span,
.calibration small,
.calibration p {
  display: block;
  margin: 0;
  color: var(--muted);
  font: .58rem var(--mono);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.calibration-lead > span { color: var(--cyan); }
.calibration-lead strong {
  display: block;
  margin: .45rem 0 .35rem;
  font: 600 .95rem var(--mono);
}
.calibration article strong {
  display: block;
  margin: .4rem 0 .3rem;
  font: 500 1.25rem var(--mono);
}
.calibration article strong small { display: inline; margin-left: .25rem; }
.calibration-notice {
  grid-column: 1 / -1;
  padding: .7rem 1rem;
  border-top: 1px solid var(--line);
  line-height: 1.55;
  text-transform: none !important;
}
@media (max-width: 760px) {
  .calibration { grid-template-columns: 1fr; }
  .calibration > div,
  .calibration article { border-right: 0; border-bottom: 1px solid var(--line); }
}
</style>
