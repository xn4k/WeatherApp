<script setup lang="ts">
import { ref } from 'vue'
import { searchLocations } from '../api/weather'
import type { LocationResult } from '../types/weather'

const emit = defineEmits<{
  select: [location: LocationResult]
}>()

const query = ref('')
const results = ref<LocationResult[]>([])
const open = ref(false)
const loading = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined

function onInput() {
  clearTimeout(timer)
  error.value = ''
  if (query.value.trim().length < 2) {
    results.value = []
    open.value = false
    return
  }
  timer = setTimeout(runSearch, 250)
}

async function runSearch() {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  try {
    results.value = await searchLocations(query.value.trim(), controller.signal)
    open.value = true
  } catch (reason) {
    if ((reason as Error).name !== 'AbortError') {
      error.value = (reason as Error).message
      open.value = true
    }
  } finally {
    loading.value = false
  }
}

function select(location: LocationResult) {
  query.value = ''
  open.value = false
  emit('select', location)
}

function locationDetail(location: LocationResult) {
  return [location.region, location.country].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="location-search">
    <label class="search-shell">
      <span class="search-symbol" aria-hidden="true"></span>
      <span class="sr-only">Ort suchen</span>
      <input
        v-model="query"
        type="search"
        placeholder="Ort oder Postleitzahl"
        autocomplete="off"
        @input="onInput"
        @focus="results.length && (open = true)"
        @keydown.escape="open = false"
      />
      <span v-if="loading" class="search-loader" aria-label="Suche läuft"></span>
      <kbd v-else>⌘ K</kbd>
    </label>

    <div v-if="open" class="search-results">
      <p v-if="error" class="search-message">{{ error }}</p>
      <p v-else-if="!results.length && !loading" class="search-message">Kein passender Ort gefunden.</p>
      <button
        v-for="location in results"
        :key="location.id"
        type="button"
        @click="select(location)"
      >
        <span>{{ location.name }}</span>
        <small>{{ locationDetail(location) }}</small>
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  </div>
</template>

