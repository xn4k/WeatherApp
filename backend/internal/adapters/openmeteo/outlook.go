package openmeteo

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"

	"isobar/internal/weather"
)

const (
	ensembleURL = "https://ensemble-api.open-meteo.com/v1/ensemble"
	seasonalURL = "https://seasonal-api.open-meteo.com/v1/seasonal"
)

type dynamicDailyResponse struct {
	Daily map[string]json.RawMessage `json:"daily"`
}

type outlookDefinition struct {
	id, name, short, suffix string
}

func (c *Client) ModelOutlook(ctx context.Context, coordinates weather.Coordinates) ([]weather.OutlookModel, []string, error) {
	values := url.Values{
		"latitude":      {strconv.FormatFloat(coordinates.Latitude, 'f', 5, 64)},
		"longitude":     {strconv.FormatFloat(coordinates.Longitude, 'f', 5, 64)},
		"models":        {"icon_seamless,ecmwf_ifs025,ecmwf_aifs025_single,gfs_seamless"},
		"daily":         {"temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum"},
		"forecast_days": {"16"},
		"timezone":      {"auto"},
	}
	daily, err := c.fetchDynamicDaily(ctx, c.forecastURL, values)
	if err != nil {
		return nil, nil, err
	}
	dates, err := decodeStrings(daily, "time")
	if err != nil {
		return nil, nil, err
	}
	definitions := []outlookDefinition{
		{id: "icon", name: "DWD ICON", short: "ICON", suffix: "icon_seamless"},
		{id: "ifs", name: "ECMWF IFS", short: "IFS", suffix: "ecmwf_ifs025"},
		{id: "aifs", name: "ECMWF AIFS", short: "AIFS", suffix: "ecmwf_aifs025_single"},
		{id: "gfs", name: "NOAA GFS", short: "GFS", suffix: "gfs_seamless"},
	}
	models := make([]weather.OutlookModel, 0, len(definitions))
	var warnings []string
	for _, definition := range definitions {
		model, modelErr := normalizeModel(daily, dates, definition)
		if modelErr != nil {
			warnings = append(warnings, definition.short+" nicht verfügbar")
			continue
		}
		if len(model.Daily) > 0 {
			models = append(models, model)
		}
	}
	if len(models) < 2 {
		return nil, warnings, fmt.Errorf("only %d long-range models available", len(models))
	}
	return models, warnings, nil
}

func normalizeModel(daily map[string]json.RawMessage, dates []string, definition outlookDefinition) (weather.OutlookModel, error) {
	minimums, err := decodeNullable(daily, "temperature_2m_min_"+definition.suffix)
	if err != nil {
		return weather.OutlookModel{}, err
	}
	maximums, err := decodeNullable(daily, "temperature_2m_max_"+definition.suffix)
	if err != nil {
		return weather.OutlookModel{}, err
	}
	probabilities, _ := decodeNullable(daily, "precipitation_probability_max_"+definition.suffix)
	precipitation, _ := decodeNullable(daily, "precipitation_sum_"+definition.suffix)
	points := make([]weather.OutlookModelDay, 0, len(dates))
	for index, date := range dates {
		minimum, maximum := nullableAt(minimums, index), nullableAt(maximums, index)
		if minimum == nil || maximum == nil {
			continue
		}
		point := weather.OutlookModelDay{
			Date: date, TemperatureMin: *minimum, TemperatureMax: *maximum,
			PrecipitationProbability: nullableAt(probabilities, index),
		}
		if value := nullableAt(precipitation, index); value != nil {
			point.Precipitation = *value
		}
		points = append(points, point)
	}
	return weather.OutlookModel{
		ID: definition.id, Name: definition.name, Short: definition.short,
		HorizonDays: len(points), Daily: points,
	}, nil
}

func (c *Client) EnsembleOutlook(ctx context.Context, coordinates weather.Coordinates) ([]weather.EnsembleModel, []string, error) {
	type definition struct{ endpoint, model, id, name, short string }
	definitions := []definition{
		{ensembleURL, "ncep_gefs05", "gefs", "NOAA GFS Ensemble", "GEFS"},
		{seasonalURL, "ecmwf_ec46", "ec46", "ECMWF EC46", "EC46"},
	}
	type outcome struct {
		index int
		model weather.EnsembleModel
		err   error
	}
	results := make(chan outcome, len(definitions))
	var group sync.WaitGroup
	for index, item := range definitions {
		group.Add(1)
		go func(index int, item definition) {
			defer group.Done()
			model, err := c.fetchEnsemble(ctx, coordinates, item.endpoint, item.model, item.id, item.name, item.short)
			results <- outcome{index: index, model: model, err: err}
		}(index, item)
	}
	group.Wait()
	close(results)
	ordered := make([]weather.EnsembleModel, len(definitions))
	available := make([]bool, len(definitions))
	var warnings []string
	for result := range results {
		if result.err != nil {
			warnings = append(warnings, definitions[result.index].short+" nicht verfügbar")
			continue
		}
		ordered[result.index], available[result.index] = result.model, true
	}
	var models []weather.EnsembleModel
	for index, model := range ordered {
		if available[index] {
			models = append(models, model)
		}
	}
	if len(models) == 0 {
		return nil, warnings, fmt.Errorf("no ensemble model available")
	}
	return models, warnings, nil
}

func (c *Client) fetchEnsemble(ctx context.Context, coordinates weather.Coordinates, endpoint, model, id, name, short string) (weather.EnsembleModel, error) {
	values := url.Values{
		"latitude":      {strconv.FormatFloat(coordinates.Latitude, 'f', 5, 64)},
		"longitude":     {strconv.FormatFloat(coordinates.Longitude, 'f', 5, 64)},
		"models":        {model},
		"daily":         {"temperature_2m_mean,precipitation_sum"},
		"forecast_days": {"30"},
		"timezone":      {"auto"},
	}
	daily, err := c.fetchDynamicDaily(ctx, endpoint, values)
	if err != nil {
		return weather.EnsembleModel{}, fmt.Errorf("%s: %w", short, err)
	}
	dates, err := decodeStrings(daily, "time")
	if err != nil {
		return weather.EnsembleModel{}, err
	}
	temperatures, err := decodeMembers(daily, "temperature_2m_mean")
	if err != nil {
		return weather.EnsembleModel{}, err
	}
	precipitation, err := decodeMembers(daily, "precipitation_sum")
	if err != nil {
		return weather.EnsembleModel{}, err
	}
	points := make([]weather.EnsembleDay, 0, len(dates))
	for index, date := range dates {
		tempValues := memberValuesAt(temperatures, index)
		if len(tempValues) == 0 {
			continue
		}
		rainValues := memberValuesAt(precipitation, index)
		points = append(points, weather.EnsembleDay{
			Date:              date,
			TemperatureMedian: quantile(tempValues, .5), TemperatureP10: quantile(tempValues, .1), TemperatureP90: quantile(tempValues, .9),
			PrecipitationMedian: quantile(rainValues, .5), PrecipitationP10: quantile(rainValues, .1), PrecipitationP90: quantile(rainValues, .9),
		})
	}
	if len(points) == 0 {
		return weather.EnsembleModel{}, fmt.Errorf("%s returned no daily data", short)
	}
	return weather.EnsembleModel{ID: id, Name: name, Short: short, MemberCount: len(temperatures), Daily: points}, nil
}

func (c *Client) fetchDynamicDaily(ctx context.Context, endpoint string, values url.Values) (map[string]json.RawMessage, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+values.Encode(), nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("outlook returned HTTP %d", response.StatusCode)
	}
	var payload dynamicDailyResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if len(payload.Daily) == 0 {
		return nil, fmt.Errorf("outlook returned no daily data")
	}
	return payload.Daily, nil
}

func decodeStrings(daily map[string]json.RawMessage, key string) ([]string, error) {
	var values []string
	raw, ok := daily[key]
	if !ok {
		return nil, fmt.Errorf("missing %s", key)
	}
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, err
	}
	return values, nil
}

func decodeNullable(daily map[string]json.RawMessage, key string) ([]*float64, error) {
	var values []*float64
	raw, ok := daily[key]
	if !ok {
		return nil, fmt.Errorf("missing %s", key)
	}
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, err
	}
	return values, nil
}

func nullableAt(values []*float64, index int) *float64 {
	if index < 0 || index >= len(values) {
		return nil
	}
	return values[index]
}

func decodeMembers(daily map[string]json.RawMessage, prefix string) ([][]*float64, error) {
	var keys []string
	for key := range daily {
		if key == prefix || strings.HasPrefix(key, prefix+"_member") {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	if len(keys) == 0 {
		return nil, fmt.Errorf("missing ensemble field %s", prefix)
	}
	series := make([][]*float64, 0, len(keys))
	for _, key := range keys {
		values, err := decodeNullable(daily, key)
		if err != nil {
			return nil, err
		}
		series = append(series, values)
	}
	return series, nil
}

func memberValuesAt(series [][]*float64, index int) []float64 {
	var values []float64
	for _, member := range series {
		if value := nullableAt(member, index); value != nil {
			values = append(values, *value)
		}
	}
	return values
}

func quantile(values []float64, probability float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	position := math.Max(0, math.Min(1, probability)) * float64(len(sorted)-1)
	lower, upper := int(math.Floor(position)), int(math.Ceil(position))
	if lower == upper {
		return sorted[lower]
	}
	weight := position - float64(lower)
	return sorted[lower]*(1-weight) + sorted[upper]*weight
}
