export interface ChartSeries {
  id: string
  label: string
  color: string
  values: Array<number | null>
  lower?: Array<number | null>
  upper?: Array<number | null>
  emphasized?: boolean
}
