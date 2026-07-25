<script setup lang="ts">
import type { Palette } from '../composables/usePalette'

defineProps<{
  palette: Palette
  automatic: boolean
  position: number
  total: number
}>()

defineEmits<{
  next: []
  toggle: []
}>()
</script>

<template>
  <div class="palette-control">
    <button
      class="palette-next"
      type="button"
      :aria-label="`Nächste Farbpalette. Aktuell: ${palette.name}`"
      @click="$emit('next')"
    >
      <span class="palette-swatches" aria-hidden="true">
        <i v-for="color in palette.colors" :key="color" :style="{ background: color }"></i>
      </span>
      <span class="palette-copy">
        <small>Palette {{ String(position).padStart(2, '0') }} / {{ String(total).padStart(2, '0') }}</small>
        <strong>{{ palette.name }}</strong>
      </span>
      <span class="cycle-icon" aria-hidden="true">↻</span>
    </button>
    <button
      class="palette-auto"
      type="button"
      :class="{ active: automatic }"
      :aria-pressed="automatic"
      @click="$emit('toggle')"
    >
      <span></span>
      Auto {{ automatic ? 'an' : 'aus' }}
    </button>
  </div>
</template>

