import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMosmixKml } from '../src/mosmix.mjs'

const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:dwd="https://opendata.dwd.de/weather/lib/pointforecast_dwd_extension_V1_0.xsd">
  <Document>
    <dwd:ExtendedData><dwd:ProductDefinition>
      <dwd:IssueTime>2026-08-09T00:00:00.000Z</dwd:IssueTime>
      <dwd:ReferencedModel><dwd:Model dwd:name="ICON" /></dwd:ReferencedModel>
      <dwd:ForecastTimeSteps>
        <dwd:TimeStep>2026-08-09T00:00:00.000Z</dwd:TimeStep>
        <dwd:TimeStep>2026-08-09T01:00:00.000Z</dwd:TimeStep>
      </dwd:ForecastTimeSteps>
    </dwd:ProductDefinition></dwd:ExtendedData>
    <Placemark><dwd:ExtendedData>
      <dwd:Forecast dwd:elementName="TTT"><dwd:value>293.15 295.15</dwd:value></dwd:Forecast>
      <dwd:Forecast dwd:elementName="RR1c"><dwd:value>0.5 1.5</dwd:value></dwd:Forecast>
    </dwd:ExtendedData></Placemark>
  </Document>
</kml>`

test('MOSMIX hourly values become a daily point challenger', () => {
  const result = parseMosmixKml(xml, { id: '10513', name: 'Koeln/Bonn' }, 'Europe/Berlin')

  assert.equal(result.role, 'challenger')
  assert.equal(result.daily[0].temperatureMean, 21)
  assert.equal(result.daily[0].temperatureMin, 20)
  assert.equal(result.daily[0].temperatureMax, 22)
  assert.equal(result.daily[0].precipitationSum, 2)
})
