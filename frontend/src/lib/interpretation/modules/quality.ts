import { sourceLabel, value } from '../helpers'
import type { InterpretationInsight, InterpretationModule } from '../types'

const method = 'quality-reading-v1.0.0'

function ageText(refreshedAt: string) {
  const timestamp = new Date(refreshedAt)
  if (!Number.isFinite(timestamp.getTime())) return 'zu einem nicht lesbaren Zeitpunkt aktualisiert'
  const formatted = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(timestamp)
  return `am ${formatted} Uhr aktualisiert`
}

export const qualityModule: InterpretationModule = {
  id: 'quality',
  version: method,
  interpret(context) {
    const outlook = context.outlook
    const insights: InterpretationInsight[] = []
    const quality = outlook.dataQuality
    if (quality) {
      const missing = [...quality.missingModelIds, ...quality.partialModelIds]
      const qualityText = quality.health === 'healthy'
        ? `Alle ${quality.availableFusionModels} erwarteten Fusionsmodelle liefern ausreichend vollständige Daten.`
        : quality.health === 'degraded'
          ? `Der Lauf ist nutzbar, aber die Evidenz ist eingeschränkt${missing.length ? `: betroffen sind ${missing.join(', ')}` : ''}.`
          : `Der Lauf ist technisch kritisch; zentrale Modell- oder Tagesdaten fehlen${missing.length ? ` (${missing.join(', ')})` : ''}.`
      insights.push({
        id: 'quality-model-data',
        domain: 'quality',
        priority: 100,
        tone: quality.health === 'healthy' ? 'positive' : quality.health === 'critical' ? 'caution' : 'watch',
        title: `Datenqualität: ${quality.health}`,
        plain: qualityText,
        technical: `${quality.availableFusionModels}/${quality.expectedFusionModels} Fusionsmodelle; ${quality.providerWarningCount} Providerwarnungen; stale after ${quality.staleAfter}.`,
        evidence: [
          { label: 'Verfügbare Modelle', value: `${quality.availableFusionModels}/${quality.expectedFusionModels}`, source: 'dataQuality.availableFusionModels/expectedFusionModels' },
          { label: 'Providerwarnungen', value: String(quality.providerWarningCount), source: 'dataQuality.providerWarningCount' },
          { label: 'Teilweise/fehlend', value: missing.join(', ') || 'keine', source: 'dataQuality.partialModelIds/missingModelIds' },
        ],
        limitation: 'Degraded bedeutet eingeschränkte Evidenz und nicht automatisch eine falsche Prognose.',
      })
    }

    insights.push({
      id: 'quality-freshness',
      domain: 'quality',
      priority: 80,
      tone: outlook.source === 'stale' ? 'watch' : 'neutral',
      title: `${sourceLabel(outlook.source)}`,
      plain: `Die Datenquelle ist als „${sourceLabel(outlook.source)}“ gekennzeichnet; die Werte wurden ${ageText(outlook.refreshedAt)}.`,
      technical: `source=${outlook.source}; refreshedAt=${outlook.refreshedAt}.`,
      evidence: [
        { label: 'Quelle', value: outlook.source, source: 'outlook.source' },
        { label: 'Aktualisiert', value: outlook.refreshedAt, source: 'outlook.refreshedAt' },
      ],
      limitation: outlook.source === 'stale' ? 'Ein älterer Lauf kann neue Modellrechnungen noch nicht enthalten.' : undefined,
    })

    const passport = outlook.forecastPassport
    if (passport) {
      insights.push({
        id: 'quality-passport',
        domain: 'quality',
        priority: 65,
        tone: 'neutral',
        title: 'Forecast Passport vorhanden',
        plain: 'Modellliste, Memberzahlen, Algorithmusversion und Payload-Hash sind für diesen Lauf eingefroren. Die spätere Prüfung kann deshalb rekonstruieren, was zum Ausgabezeitpunkt bekannt war.',
        technical: `${passport.algorithmVersion}; ${passport.modelIds.length} Modelle; Hash ${passport.payloadHash.slice(0, 12)}…; Quality ${passport.dataQuality}.`,
        evidence: [
          { label: 'Algorithmus', value: passport.algorithmVersion, source: 'forecastPassport.algorithmVersion' },
          { label: 'Modelle', value: String(passport.modelIds.length), source: 'forecastPassport.modelIds' },
          { label: 'Payload-Hash', value: `${passport.payloadHash.slice(0, 12)}…`, source: 'forecastPassport.payloadHash' },
        ],
        limitation: 'Nachvollziehbarkeit garantiert noch keine Prognosegüte; sie macht die spätere Prüfung reproduzierbar.',
      })
    }

    const radolan = outlook.radolanStatus
    if (radolan) {
      insights.push({
        id: 'quality-radolan',
        domain: 'quality',
        priority: 55,
        tone: radolan.status === 'active' ? 'positive' : radolan.status === 'unavailable' ? 'watch' : 'neutral',
        title: `RADOLAN-Referenz: ${radolan.status}`,
        plain: radolan.status === 'active'
          ? `${radolan.references} flächige RADOLAN-Niederschlagsreferenzen stehen für die Verifikation bereit.`
          : radolan.status === 'unavailable'
            ? 'Die flächige RADOLAN-Niederschlagsreferenz war für diesen Lauf nicht verfügbar; Stationsniederschlag bleibt separat erhalten.'
            : 'Die Pipeline hat noch keine abgeschlossenen RADOLAN-Referenztage gesammelt.',
        technical: `status=${radolan.status}; references=${radolan.references}; warning=${radolan.warning ?? 'keine'}.`,
        evidence: [
          { label: 'Status', value: radolan.status, source: 'radolanStatus.status' },
          { label: 'Referenzen', value: value(radolan.references, 0), source: 'radolanStatus.references' },
        ],
        limitation: 'RADOLAN ist eine flächige Niederschlagsreferenz und beantwortet andere Fragen als eine einzelne Bodenstation.',
      })
    }

    if (outlook.warnings?.length) {
      insights.push({
        id: 'quality-warnings',
        domain: 'quality',
        priority: 95,
        tone: 'watch',
        title: `${outlook.warnings.length} technische Hinweise`,
        plain: `Dieser Lauf enthält technische Hinweise: ${outlook.warnings.join(' ')}`,
        technical: outlook.warnings.join(' | '),
        evidence: outlook.warnings.map((warning, index) => ({ label: `Warnung ${index + 1}`, value: warning, source: 'outlook.warnings' })),
        limitation: 'Providerwarnungen müssen im Kontext der betroffenen Variablen und Modelle gelesen werden.',
      })
    }

    return {
      id: 'quality',
      method,
      title: 'Datenqualität und Herkunft',
      kicker: 'Wie belastbar und nachvollziehbar der Lauf ist',
      availability: quality && passport ? 'available' : 'partial',
      summary: insights[0]?.plain ?? 'Datenquelle und Aktualisierungszeit sind vorhanden; die erweiterte Qualitätsprüfung fehlt noch.',
      insights,
    }
  },
}
