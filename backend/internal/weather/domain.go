package weather

import "time"

type Coordinates struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type Current struct {
	Time                string  `json:"time"`
	Temperature         float64 `json:"temperature"`
	ApparentTemperature float64 `json:"apparentTemperature"`
	Humidity            float64 `json:"humidity"`
	Pressure            float64 `json:"pressure"`
	Precipitation       float64 `json:"precipitation"`
	WindSpeed           float64 `json:"windSpeed"`
	WindGusts           float64 `json:"windGusts"`
	WindDirection       float64 `json:"windDirection"`
	WeatherCode         int     `json:"weatherCode"`
}

type HourlyPoint struct {
	Time                     string  `json:"time"`
	Temperature              float64 `json:"temperature"`
	PrecipitationProbability float64 `json:"precipitationProbability"`
	Precipitation            float64 `json:"precipitation"`
	WindSpeed                float64 `json:"windSpeed"`
	WindGusts                float64 `json:"windGusts"`
}

type DailyPoint struct {
	Date                     string  `json:"date"`
	WeatherCode              int     `json:"weatherCode"`
	TemperatureMax           float64 `json:"temperatureMax"`
	TemperatureMin           float64 `json:"temperatureMin"`
	PrecipitationProbability float64 `json:"precipitationProbability"`
	Precipitation            float64 `json:"precipitation"`
	WindSpeedMax             float64 `json:"windSpeedMax"`
	WindGustsMax             float64 `json:"windGustsMax"`
	Sunrise                  string  `json:"sunrise"`
	Sunset                   string  `json:"sunset"`
}

type ModelForecast struct {
	ID      string        `json:"id"`
	Label   string        `json:"label"`
	Current Current       `json:"current"`
	Hourly  []HourlyPoint `json:"hourly"`
	Daily   []DailyPoint  `json:"daily"`
}

type ModelSummary struct {
	ID              string  `json:"id"`
	Label           string  `json:"label"`
	TodayMax        float64 `json:"todayMax"`
	TodayMin        float64 `json:"todayMin"`
	NextSixHourRain float64 `json:"nextSixHourRain"`
}

type Consensus struct {
	TodayMax        float64 `json:"todayMax"`
	TodayMin        float64 `json:"todayMin"`
	MaxSpread       float64 `json:"maxSpread"`
	Agreement       string  `json:"agreement"`
	RainProbability float64 `json:"rainProbability"`
}

type Forecast struct {
	Location    string          `json:"location"`
	Coordinates Coordinates     `json:"coordinates"`
	Timezone    string          `json:"timezone"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	Stale       bool            `json:"stale"`
	Current     Current         `json:"current"`
	Models      []ModelForecast `json:"models"`
	Daily       []DailyPoint    `json:"daily"`
	Summaries   []ModelSummary  `json:"modelSummaries"`
	Consensus   Consensus       `json:"consensus"`
}
