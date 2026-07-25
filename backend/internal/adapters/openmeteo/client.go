package openmeteo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"isobar/internal/location"
	"isobar/internal/weather"
)

type Client struct {
	httpClient   *http.Client
	forecastURL  string
	geocodingURL string
}

type modelDefinition struct {
	id    string
	label string
}

var models = []modelDefinition{
	{id: "icon_seamless", label: "ICON"},
	{id: "ecmwf_ifs025", label: "IFS"},
	{id: "gfs_seamless", label: "GFS"},
}

func NewClient() *Client {
	return &Client{
		httpClient:   &http.Client{Timeout: 12 * time.Second},
		forecastURL:  "https://api.open-meteo.com/v1/forecast",
		geocodingURL: "https://geocoding-api.open-meteo.com/v1/search",
	}
}

type forecastResponse struct {
	Timezone string `json:"timezone"`
	Current  struct {
		Time                string  `json:"time"`
		Temperature         float64 `json:"temperature_2m"`
		ApparentTemperature float64 `json:"apparent_temperature"`
		Humidity            float64 `json:"relative_humidity_2m"`
		Precipitation       float64 `json:"precipitation"`
		WeatherCode         int     `json:"weather_code"`
		Pressure            float64 `json:"surface_pressure"`
		WindSpeed           float64 `json:"wind_speed_10m"`
		WindDirection       float64 `json:"wind_direction_10m"`
		WindGusts           float64 `json:"wind_gusts_10m"`
	} `json:"current"`
	Hourly struct {
		Time                     []string  `json:"time"`
		Temperature              []float64 `json:"temperature_2m"`
		PrecipitationProbability []float64 `json:"precipitation_probability"`
		Precipitation            []float64 `json:"precipitation"`
		WindSpeed                []float64 `json:"wind_speed_10m"`
		WindGusts                []float64 `json:"wind_gusts_10m"`
	} `json:"hourly"`
	Daily struct {
		Time                     []string  `json:"time"`
		WeatherCode              []int     `json:"weather_code"`
		TemperatureMax           []float64 `json:"temperature_2m_max"`
		TemperatureMin           []float64 `json:"temperature_2m_min"`
		PrecipitationProbability []float64 `json:"precipitation_probability_max"`
		Precipitation            []float64 `json:"precipitation_sum"`
		WindSpeedMax             []float64 `json:"wind_speed_10m_max"`
		WindGustsMax             []float64 `json:"wind_gusts_10m_max"`
		Sunrise                  []string  `json:"sunrise"`
		Sunset                   []string  `json:"sunset"`
	} `json:"daily"`
}

func (c *Client) Forecast(ctx context.Context, coordinates weather.Coordinates) ([]weather.ModelForecast, string, error) {
	type outcome struct {
		index    int
		forecast weather.ModelForecast
		timezone string
		err      error
	}
	results := make(chan outcome, len(models))
	var wg sync.WaitGroup

	for index, model := range models {
		wg.Add(1)
		go func(index int, model modelDefinition) {
			defer wg.Done()
			forecast, timezone, err := c.fetchModel(ctx, coordinates, model)
			results <- outcome{index: index, forecast: forecast, timezone: timezone, err: err}
		}(index, model)
	}
	wg.Wait()
	close(results)

	ordered := make([]weather.ModelForecast, len(models))
	availableModel := make([]bool, len(models))
	timezone := ""
	var lastError error
	for result := range results {
		if result.err != nil {
			lastError = result.err
			continue
		}
		ordered[result.index] = result.forecast
		availableModel[result.index] = true
		if timezone == "" {
			timezone = result.timezone
		}
	}

	available := make([]weather.ModelForecast, 0, len(models))
	for index, model := range ordered {
		if availableModel[index] {
			available = append(available, model)
		}
	}
	if len(available) == 0 {
		if lastError == nil {
			lastError = errors.New("no forecast model returned data")
		}
		return nil, "", lastError
	}
	return available, timezone, nil
}

func (c *Client) fetchModel(ctx context.Context, coordinates weather.Coordinates, model modelDefinition) (weather.ModelForecast, string, error) {
	query := url.Values{
		"latitude":      {strconv.FormatFloat(coordinates.Latitude, 'f', 5, 64)},
		"longitude":     {strconv.FormatFloat(coordinates.Longitude, 'f', 5, 64)},
		"models":        {model.id},
		"current":       {"temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m"},
		"hourly":        {"temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m"},
		"daily":         {"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset"},
		"timezone":      {"auto"},
		"forecast_days": {"10"},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.forecastURL+"?"+query.Encode(), nil)
	if err != nil {
		return weather.ModelForecast{}, "", err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return weather.ModelForecast{}, "", fmt.Errorf("%s request failed: %w", model.label, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return weather.ModelForecast{}, "", fmt.Errorf("%s returned HTTP %d", model.label, response.StatusCode)
	}

	var payload forecastResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return weather.ModelForecast{}, "", fmt.Errorf("%s response invalid: %w", model.label, err)
	}

	result := weather.ModelForecast{
		ID:    model.id,
		Label: model.label,
		Current: weather.Current{
			Time:                payload.Current.Time,
			Temperature:         payload.Current.Temperature,
			ApparentTemperature: payload.Current.ApparentTemperature,
			Humidity:            payload.Current.Humidity,
			Pressure:            payload.Current.Pressure,
			Precipitation:       payload.Current.Precipitation,
			WindSpeed:           payload.Current.WindSpeed,
			WindGusts:           payload.Current.WindGusts,
			WindDirection:       payload.Current.WindDirection,
			WeatherCode:         payload.Current.WeatherCode,
		},
	}
	for index, timestamp := range payload.Hourly.Time {
		if index >= len(payload.Hourly.Temperature) {
			break
		}
		result.Hourly = append(result.Hourly, weather.HourlyPoint{
			Time:                     timestamp,
			Temperature:              at(payload.Hourly.Temperature, index),
			PrecipitationProbability: at(payload.Hourly.PrecipitationProbability, index),
			Precipitation:            at(payload.Hourly.Precipitation, index),
			WindSpeed:                at(payload.Hourly.WindSpeed, index),
			WindGusts:                at(payload.Hourly.WindGusts, index),
		})
	}
	for index, date := range payload.Daily.Time {
		if index >= len(payload.Daily.TemperatureMax) {
			break
		}
		result.Daily = append(result.Daily, weather.DailyPoint{
			Date:                     date,
			WeatherCode:              atInt(payload.Daily.WeatherCode, index),
			TemperatureMax:           at(payload.Daily.TemperatureMax, index),
			TemperatureMin:           at(payload.Daily.TemperatureMin, index),
			PrecipitationProbability: at(payload.Daily.PrecipitationProbability, index),
			Precipitation:            at(payload.Daily.Precipitation, index),
			WindSpeedMax:             at(payload.Daily.WindSpeedMax, index),
			WindGustsMax:             at(payload.Daily.WindGustsMax, index),
			Sunrise:                  atString(payload.Daily.Sunrise, index),
			Sunset:                   atString(payload.Daily.Sunset, index),
		})
	}
	return result, payload.Timezone, nil
}

type geocodingResponse struct {
	Results []struct {
		ID        int64   `json:"id"`
		Name      string  `json:"name"`
		Admin1    string  `json:"admin1"`
		Country   string  `json:"country"`
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
		Timezone  string  `json:"timezone"`
	} `json:"results"`
}

func (c *Client) Search(ctx context.Context, query string) ([]location.Result, error) {
	values := url.Values{
		"name": {query}, "count": {"7"}, "language": {"de"}, "format": {"json"},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.geocodingURL+"?"+values.Encode(), nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("geocoding returned HTTP %d", response.StatusCode)
	}
	var payload geocodingResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	results := make([]location.Result, 0, len(payload.Results))
	for _, item := range payload.Results {
		results = append(results, location.Result{
			ID: item.ID, Name: item.Name, Region: item.Admin1, Country: item.Country,
			Latitude: item.Latitude, Longitude: item.Longitude, Timezone: item.Timezone,
		})
	}
	return results, nil
}

func at(values []float64, index int) float64 {
	if index >= 0 && index < len(values) {
		return values[index]
	}
	return 0
}

func atInt(values []int, index int) int {
	if index >= 0 && index < len(values) {
		return values[index]
	}
	return 0
}

func atString(values []string, index int) string {
	if index >= 0 && index < len(values) {
		return values[index]
	}
	return ""
}
