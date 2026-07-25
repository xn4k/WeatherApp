import { readonly, ref } from 'vue'

export interface Palette {
  readonly id: string
  readonly name: string
  readonly colors: readonly string[]
  tokens: {
    background: string
    surface: string
    surfaceHigh: string
    text: string
    muted: string
    accent: string
    modelIcon: string
    modelIfs: string
    modelGfs: string
    line: string
    lineStrong: string
  }
}

export const palettes: Palette[] = [
  {
    id: 'carbon-lime',
    name: 'Carbon Lime',
    colors: ['#0c100e', '#edf1e9', '#d9ff43', '#69d8ff', '#fe9f6d'],
    tokens: {
      background: '#0c100e',
      surface: '#111714',
      surfaceHigh: '#151d19',
      text: '#edf1e9',
      muted: '#8e9b92',
      accent: '#d9ff43',
      modelIcon: '#d9ff43',
      modelIfs: '#69d8ff',
      modelGfs: '#fe9f6d',
      line: 'rgba(224, 237, 226, 0.13)',
      lineStrong: 'rgba(224, 237, 226, 0.24)',
    },
  },
  {
    id: 'mint-dusk',
    name: 'Mint Dusk',
    colors: ['#171312', '#7a6563', '#ece2d0', '#7fd1b9', '#e56399'],
    tokens: {
      background: '#171312',
      surface: '#211a19',
      surfaceHigh: '#2a211f',
      text: '#ece2d0',
      muted: '#b7a5a0',
      accent: '#7fd1b9',
      modelIcon: '#e56399',
      modelIfs: '#7fd1b9',
      modelGfs: '#d3a588',
      line: 'rgba(236, 226, 208, 0.14)',
      lineStrong: 'rgba(236, 226, 208, 0.28)',
    },
  },
  {
    id: 'polar-night',
    name: 'Polar Night',
    colors: ['#0b132b', '#1c2541', '#e0fbfc', '#5bc0be', '#ffca3a'],
    tokens: {
      background: '#0b132b',
      surface: '#111b36',
      surfaceHigh: '#182344',
      text: '#e0fbfc',
      muted: '#91a7b8',
      accent: '#5bc0be',
      modelIcon: '#5bc0be',
      modelIfs: '#98c1d9',
      modelGfs: '#ffca3a',
      line: 'rgba(224, 251, 252, 0.13)',
      lineStrong: 'rgba(224, 251, 252, 0.25)',
    },
  },
  {
    id: 'amber-archive',
    name: 'Amber Archive',
    colors: ['#17130d', '#342a1e', '#f2eadf', '#ffb000', '#7cc6a5'],
    tokens: {
      background: '#17130d',
      surface: '#201a12',
      surfaceHigh: '#2a2117',
      text: '#f2eadf',
      muted: '#ae9f8c',
      accent: '#ffb000',
      modelIcon: '#ffb000',
      modelIfs: '#7cc6a5',
      modelGfs: '#f0805a',
      line: 'rgba(242, 234, 223, 0.13)',
      lineStrong: 'rgba(242, 234, 223, 0.25)',
    },
  },
  {
    id: 'violet-pressure',
    name: 'Violet Pressure',
    colors: ['#130f1c', '#2a203c', '#f0e9ff', '#c8ff66', '#b28dff'],
    tokens: {
      background: '#130f1c',
      surface: '#1b1527',
      surfaceHigh: '#241c34',
      text: '#f0e9ff',
      muted: '#a79bb8',
      accent: '#c8ff66',
      modelIcon: '#c8ff66',
      modelIfs: '#8ed8ff',
      modelGfs: '#b28dff',
      line: 'rgba(240, 233, 255, 0.13)',
      lineStrong: 'rgba(240, 233, 255, 0.25)',
    },
  },
  {
    id: 'signal-red',
    name: 'Signal Red',
    colors: ['#14100f', '#2a1e1b', '#f5eee8', '#ff5c35', '#70d6c7'],
    tokens: {
      background: '#14100f',
      surface: '#1d1715',
      surfaceHigh: '#281e1b',
      text: '#f5eee8',
      muted: '#aa9b92',
      accent: '#ff5c35',
      modelIcon: '#ff5c35',
      modelIfs: '#70d6c7',
      modelGfs: '#f3c969',
      line: 'rgba(245, 238, 232, 0.13)',
      lineStrong: 'rgba(245, 238, 232, 0.25)',
    },
  },
]

const current = ref<Palette>(palettes[0])
const automatic = ref(true)
let initialized = false

function applyPalette(palette: Palette) {
  current.value = palette
  const root = document.documentElement
  root.dataset.palette = palette.id
  root.style.setProperty('--background', palette.tokens.background)
  root.style.setProperty('--surface', palette.tokens.surface)
  root.style.setProperty('--surface-high', palette.tokens.surfaceHigh)
  root.style.setProperty('--text', palette.tokens.text)
  root.style.setProperty('--muted', palette.tokens.muted)
  root.style.setProperty('--accent', palette.tokens.accent)
  root.style.setProperty('--model-icon', palette.tokens.modelIcon)
  root.style.setProperty('--model-ifs', palette.tokens.modelIfs)
  root.style.setProperty('--model-gfs', palette.tokens.modelGfs)
  root.style.setProperty('--line', palette.tokens.line)
  root.style.setProperty('--line-strong', palette.tokens.lineStrong)
  localStorage.setItem('isobar.palette.last', palette.id)
}

function differentRandom(lastID: string | null) {
  const candidates = palettes.filter((palette) => palette.id !== lastID)
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return candidates[random[0] % candidates.length] ?? palettes[0]
}

function initialize() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  automatic.value = localStorage.getItem('isobar.palette.automatic') !== 'false'
  const lastID = localStorage.getItem('isobar.palette.last')
  const selected = automatic.value
    ? differentRandom(lastID)
    : palettes.find((palette) => palette.id === lastID) ?? palettes[0]
  applyPalette(selected)
}

function nextPalette() {
  const index = palettes.findIndex((palette) => palette.id === current.value.id)
  applyPalette(palettes[(index + 1) % palettes.length])
}

function toggleAutomatic() {
  automatic.value = !automatic.value
  localStorage.setItem('isobar.palette.automatic', String(automatic.value))
}

export function usePalette() {
  initialize()
  return {
    current: readonly(current),
    automatic: readonly(automatic),
    palettes,
    nextPalette,
    toggleAutomatic,
  }
}

