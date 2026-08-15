/**
 * Interpretation thresholds are descriptive product heuristics, not calibrated
 * error probabilities. Keeping them named and versioned makes wording changes
 * reviewable and testable.
 */
export const INTERPRETATION_THRESHOLDS = {
  temperatureSpread: {
    narrowKelvin: 2,
    wideKelvin: 4,
  },
  absoluteEnsembleSpread: {
    narrowStandardDeviationKelvin: 0.8,
    wideStandardDeviationKelvin: 1.8,
  },
  ensembleCorridor: {
    narrowKelvin: 3,
    wideKelvin: 7,
  },
  apparentTemperature: {
    noticeableDifferenceKelvin: 2,
  },
  moisture: {
    dryHumidityPercent: 45,
    humidHumidityPercent: 65,
    dryDewPointCelsius: 14,
    humidDewPointCelsius: 18,
  },
  rainSignal: {
    lowPercent: 20,
    elevatedPercent: 40,
    strongPercent: 70,
  },
  scenarioBranching: {
    distinct: 30,
    stronglySeparated: 60,
  },
  dayTrend: {
    noticeableKelvin: 0.8,
  },
  climateAnomaly: {
    noticeableKelvin: 1,
    strongKelvin: 3,
  },
} as const
