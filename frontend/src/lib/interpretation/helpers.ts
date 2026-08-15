export function finite(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => Number.isFinite(value))
}

export function median(values: Array<number | null | undefined>) {
  const sorted = finite(values).sort((left, right) => left - right)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

export function range(values: Array<number | null | undefined>) {
  const usable = finite(values)
  return usable.length ? Math.max(...usable) - Math.min(...usable) : null
}

export function value(number: number | null | undefined, digits = 1) {
  return Number.isFinite(number) ? Number(number).toFixed(digits) : '—'
}

export function percentage(number: number | null | undefined, digits = 0) {
  return Number.isFinite(number) ? `${Number(number).toFixed(digits)} %` : '—'
}

export function signed(number: number | null | undefined, digits = 1) {
  if (!Number.isFinite(number)) return '—'
  const rendered = Number(number).toFixed(digits)
  return Number(number) > 0 ? `+${rendered}` : rendered
}

export function shortDate(date: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(`${date}T12:00:00`))
}

export function horizonLabel(index: number) {
  if (index <= 2) return 'Nahbereich'
  if (index <= 6) return 'Kurzfrist'
  if (index <= 14) return 'Mittelfrist'
  return 'erweiterter Horizont'
}

export function leadBucket(index: number) {
  if (index <= 3) return 'days-0-3'
  if (index <= 7) return 'days-4-7'
  if (index <= 15) return 'days-8-15'
  return 'days-16-30'
}

export function sourceLabel(source: string) {
  if (source === 'firebase') return 'Zentral gespeicherter Firestore-Lauf'
  if (source === 'cache') return 'Lokaler Browser-Cache'
  if (source === 'stale') return 'Älterer gespeicherter Lauf'
  return 'Direkt aktualisierte Providerdaten'
}
