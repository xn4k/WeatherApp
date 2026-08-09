<script setup lang="ts">
defineProps<{
  title: string
  text: string
  formula?: string
  caution?: string
}>()
</script>

<template>
  <details class="metric-help">
    <summary :aria-label="'Erkl\u00e4rung: ' + title">?</summary>
    <aside class="metric-help__popover">
      <strong>{{ title }}</strong>
      <p>{{ text }}</p>
      <code v-if="formula">{{ formula }}</code>
      <small v-if="caution">{{ caution }}</small>
    </aside>
  </details>
</template>

<style scoped>
.metric-help {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
}
.metric-help summary {
  display: grid;
  place-items: center;
  width: 1rem;
  height: 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  color: var(--cyan);
  background: var(--background);
  cursor: help;
  font: 700 .58rem var(--mono);
  list-style: none;
}
.metric-help summary::-webkit-details-marker { display: none; }
.metric-help__popover {
  position: absolute;
  z-index: 40;
  left: -.35rem;
  top: calc(100% + .55rem);
  display: none;
  width: min(20rem, 78vw);
  padding: .8rem;
  border: 1px solid var(--line-strong);
  background: color-mix(in srgb, var(--background) 96%, black);
  box-shadow: 0 1rem 2.5rem rgba(0, 0, 0, .38);
  text-align: left;
}
.metric-help:hover .metric-help__popover,
.metric-help:focus-within .metric-help__popover,
.metric-help[open] .metric-help__popover {
  display: block;
}
.metric-help__popover strong,
.metric-help__popover p,
.metric-help__popover code,
.metric-help__popover small {
  display: block;
}
.metric-help__popover strong {
  color: var(--text);
  font: 600 .72rem var(--mono);
  text-transform: none;
  letter-spacing: 0;
}
.metric-help__popover p {
  margin: .5rem 0;
  color: var(--muted);
  font: .68rem/1.55 'Manrope', system-ui, sans-serif;
  text-transform: none;
  letter-spacing: 0;
}
.metric-help__popover code {
  padding: .45rem;
  background: var(--surface);
  color: var(--cyan);
  font: .58rem/1.5 var(--mono);
  white-space: normal;
}
.metric-help__popover small {
  margin-top: .45rem;
  color: var(--orange);
  font: .58rem/1.45 var(--mono);
  text-transform: none;
  letter-spacing: 0;
}
</style>
