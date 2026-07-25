package weather

import (
	"context"
	"errors"
	"math"
	"sort"
	"sync"
	"time"
)

type cacheEntry struct {
	forecast  Forecast
	expiresAt time.Time
}

type Service struct {
	provider Provider
	now      func() time.Time
	mu       sync.RWMutex
	cache    map[Coordinates]cacheEntry
}

func NewService(provider Provider) *Service {
	return &Service{
		provider: provider,
		now:      time.Now,
		cache:    make(map[Coordinates]cacheEntry),
	}
}

func (s *Service) Get(ctx context.Context, location string, coordinates Coordinates) (Forecast, error) {
	s.mu.RLock()
	cached, ok := s.cache[coordinates]
	s.mu.RUnlock()
	if ok && s.now().Before(cached.expiresAt) {
		return cached.forecast, nil
	}

	models, timezone, err := s.provider.Forecast(ctx, coordinates)
	if err != nil {
		if ok {
			cached.forecast.Stale = true
			return cached.forecast, nil
		}
		return Forecast{}, err
	}
	if len(models) == 0 {
		return Forecast{}, errors.New("weather provider returned no models")
	}

	result := Forecast{
		Location:    location,
		Coordinates: coordinates,
		Timezone:    timezone,
		UpdatedAt:   s.now().UTC(),
		Current:     models[0].Current,
		Models:      models,
		Daily:       consensusDays(models),
		Summaries:   summaries(models),
	}
	result.Consensus = consensus(result.Summaries)

	s.mu.Lock()
	s.cache[coordinates] = cacheEntry{forecast: result, expiresAt: s.now().Add(10 * time.Minute)}
	s.mu.Unlock()
	return result, nil
}

func summaries(models []ModelForecast) []ModelSummary {
	result := make([]ModelSummary, 0, len(models))
	for _, model := range models {
		if len(model.Daily) == 0 {
			continue
		}
		var rain []float64
		for i := 0; i < len(model.Hourly) && i < 6; i++ {
			rain = append(rain, model.Hourly[i].PrecipitationProbability)
		}
		result = append(result, ModelSummary{
			ID: model.ID, Label: model.Label,
			TodayMax:        model.Daily[0].TemperatureMax,
			TodayMin:        model.Daily[0].TemperatureMin,
			NextSixHourRain: median(rain),
		})
	}
	return result
}

func consensus(items []ModelSummary) Consensus {
	var maxes, mins, rain []float64
	for _, item := range items {
		maxes = append(maxes, item.TodayMax)
		mins = append(mins, item.TodayMin)
		rain = append(rain, item.NextSixHourRain)
	}
	spread := rangeOf(maxes)
	agreement := "hoch"
	if spread > 4 {
		agreement = "niedrig"
	} else if spread > 2 {
		agreement = "mittel"
	}
	return Consensus{
		TodayMax: median(maxes), TodayMin: median(mins), MaxSpread: round1(spread),
		Agreement: agreement, RainProbability: median(rain),
	}
}

func consensusDays(models []ModelForecast) []DailyPoint {
	maxDays := 0
	for _, model := range models {
		if len(model.Daily) > maxDays {
			maxDays = len(model.Daily)
		}
	}
	result := make([]DailyPoint, 0, maxDays)
	for day := 0; day < maxDays; day++ {
		var maxes, mins, rainProb, rain, winds, gusts []float64
		var sample DailyPoint
		var codes []int
		for _, model := range models {
			if day >= len(model.Daily) {
				continue
			}
			point := model.Daily[day]
			sample = point
			maxes = append(maxes, point.TemperatureMax)
			mins = append(mins, point.TemperatureMin)
			rainProb = append(rainProb, point.PrecipitationProbability)
			rain = append(rain, point.Precipitation)
			winds = append(winds, point.WindSpeedMax)
			gusts = append(gusts, point.WindGustsMax)
			codes = append(codes, point.WeatherCode)
		}
		if len(maxes) == 0 {
			continue
		}
		sample.TemperatureMax = median(maxes)
		sample.TemperatureMin = median(mins)
		sample.PrecipitationProbability = median(rainProb)
		sample.Precipitation = median(rain)
		sample.WindSpeedMax = median(winds)
		sample.WindGustsMax = median(gusts)
		sample.WeatherCode = mode(codes)
		result = append(result, sample)
	}
	return result
}

func median(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	copyValues := append([]float64(nil), values...)
	sort.Float64s(copyValues)
	middle := len(copyValues) / 2
	if len(copyValues)%2 == 0 {
		return round1((copyValues[middle-1] + copyValues[middle]) / 2)
	}
	return round1(copyValues[middle])
}

func rangeOf(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	minValue, maxValue := values[0], values[0]
	for _, value := range values[1:] {
		if value < minValue {
			minValue = value
		}
		if value > maxValue {
			maxValue = value
		}
	}
	return maxValue - minValue
}

func mode(values []int) int {
	counts := make(map[int]int)
	selected, best := 0, 0
	for _, value := range values {
		counts[value]++
		if counts[value] > best {
			selected, best = value, counts[value]
		}
	}
	return selected
}

func round1(value float64) float64 {
	return math.Round(value*10) / 10
}
