export interface ChartSeries {
  id: string
  label: string
  color: string
  values: Array<number | null>
  lower?: Array<number | null>
  upper?: Array<number | null>
  innerLower?: Array<number | null>
  innerUpper?: Array<number | null>
  pointDetails?: Array<string | null>
  emphasized?: boolean
  secondary?: boolean
}
