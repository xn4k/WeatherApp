package weather

import (
	"context"
	"fmt"
	"math"
	"sort"
	"sync"
	"time"
)

type OutlookModelDay struct {
	Date                     string   `json:"date"`
	TemperatureMin           float64  `json:"temperatureMin"`
	TemperatureMax           float64  `json:"temperatureMax"`
	PrecipitationProbability *float64 `json:"precipitationProbability"`
	Precipitation            float64  `json:"precipitation"`
}

type OutlookModel struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Short       string            `json:"short"`
	HorizonDays int               `json:"horizonDays"`
	Daily       []OutlookModelDay `json:"daily"`
}

type EnsembleDay struct {
	Date                 string    `json:"date"`
	TemperatureMedian    float64   `json:"temperatureMedian"`
	TemperatureP10       float64   `json:"temperatureP10"`
	TemperatureP90       float64   `json:"temperatureP90"`
	PrecipitationMedian  float64   `json:"precipitationMedian"`
	PrecipitationP10     float64   `json:"precipitationP10"`
	PrecipitationP90     float64   `json:"precipitationP90"`
	TemperatureMembers   []float64 `json:"-"`
	PrecipitationMembers []float64 `json:"-"`
}

type EnsembleModel struct {
	ID                string        `json:"id"`
	Name              string        `json:"name"`
	Short             string        `json:"short"`
	MemberCount       int           `json:"memberCount"`
	Daily             []EnsembleDay `json:"daily"`
	ExcludeFromFusion bool          `json:"-"`
}

type FusionDay struct {
	Date                string  `json:"date"`
	TemperatureP10      float64 `json:"temperatureP10"`
	TemperatureP25      float64 `json:"temperatureP25"`
	TemperatureP50      float64 `json:"temperatureP50"`
	TemperatureP75      float64 `json:"temperatureP75"`
	TemperatureP90      float64 `json:"temperatureP90"`
	PrecipitationP10    float64 `json:"precipitationP10"`
	PrecipitationP50    float64 `json:"precipitationP50"`
	PrecipitationP90    float64 `json:"precipitationP90"`
	RainProbability1mm  float64 `json:"rainProbability1mm"`
	RainProbability10mm float64 `json:"rainProbability10mm"`
	ModelCount          int     `json:"modelCount"`
	MemberCount         int     `json:"memberCount"`
}

type Fusion struct {
	Method string      `json:"method"`
	Daily  []FusionDay `json:"daily"`
	Notice string      `json:"notice"`
}

type Outlook struct {
	Mode        string          `json:"mode"`
	HorizonDays int             `json:"horizonDays"`
	Models      []OutlookModel  `json:"models,omitempty"`
	Ensembles   []EnsembleModel `json:"ensembles,omitempty"`
	Fusion      *Fusion         `json:"fusion,omitempty"`
	Notice      string          `json:"notice"`
	Warnings    []string        `json:"warnings,omitempty"`
	RefreshedAt time.Time       `json:"refreshedAt"`
	Source      string          `json:"source"`
}

type OutlookProvider interface {
	ModelOutlook(context.Context, Coordinates) ([]OutlookModel, []string, error)
	EnsembleOutlook(context.Context, Coordinates) ([]EnsembleModel, []string, error)
}

type outlookCacheEntry struct {
	value     Outlook
	expiresAt time.Time
}

type OutlookService struct {
	provider OutlookProvider
	now      func() time.Time
	mu       sync.RWMutex
	cache    map[string]outlookCacheEntry
}

func NewOutlookService(provider OutlookProvider) *OutlookService {
	return &OutlookService{
		provider: provider,
		now:      time.Now,
		cache:    make(map[string]outlookCacheEntry),
	}
}

func (s *OutlookService) Get(ctx context.Context, coordinates Coordinates, view string) (Outlook, error) {
	if view != "16" && view != "30" {
		return Outlook{}, fmt.Errorf("unsupported outlook view %q", view)
	}
	key := fmt.Sprintf("%.5f:%.5f:%s", coordinates.Latitude, coordinates.Longitude, view)
	s.mu.RLock()
	cached, ok := s.cache[key]
	s.mu.RUnlock()
	if ok && s.now().Before(cached.expiresAt) {
		cached.value.Source = "cache"
		return cached.value, nil
	}

	var result Outlook
	var err error
	if view == "16" {
		result.Models, result.Warnings, err = s.provider.ModelOutlook(ctx, coordinates)
		result.Mode = "models"
		result.HorizonDays = 16
		result.Notice = "Die Linien enden an der nativen Reichweite des jeweiligen Modells. Ab Tag 8 sinkt die räumliche Präzision deutlich."
	} else {
		result.Ensembles, result.Warnings, err = s.provider.EnsembleOutlook(ctx, coordinates)
		result.Mode = "ensemble"
		result.HorizonDays = 30
		if err == nil {
			result.Fusion = fuseEnsembles(result.Ensembles)
		}
		result.Notice = "Das Band zeigt P10 bis P90 der Ensembleläufe. Es ist ein Wahrscheinlichkeitsraum, keine garantierte Tagesprognose."
	}
	if err != nil {
		if ok {
			cached.value.Source = "stale"
			return cached.value, nil
		}
		return Outlook{}, err
	}
	result.RefreshedAt = s.now().UTC()
	result.Source = "refresh"

	s.mu.Lock()
	s.cache[key] = outlookCacheEntry{value: result, expiresAt: s.now().Add(30 * time.Minute)}
	s.mu.Unlock()
	return result, nil
}

type fusionMemberSet struct {
	temperature   []float64
	precipitation []float64
}

type weightedValue struct {
	value  float64
	weight float64
}

func fuseEnsembles(models []EnsembleModel) *Fusion {
	byDate := make(map[string][]fusionMemberSet)
	for _, model := range models {
		if model.ExcludeFromFusion {
			continue
		}
		for _, day := range model.Daily {
			temperatures, precipitation := pairedFiniteMembers(day.TemperatureMembers, day.PrecipitationMembers)
			if len(temperatures) == 0 {
				continue
			}
			byDate[day.Date] = append(byDate[day.Date], fusionMemberSet{
				temperature: temperatures, precipitation: precipitation,
			})
		}
	}
	if len(byDate) == 0 {
		return nil
	}

	dates := make([]string, 0, len(byDate))
	for date := range byDate {
		dates = append(dates, date)
	}
	sort.Strings(dates)

	daily := make([]FusionDay, 0, len(dates))
	for _, date := range dates {
		memberSets := byDate[date]
		temperatures, precipitation := balancedSamples(memberSets)
		memberCount := 0
		for _, members := range memberSets {
			memberCount += len(members.temperature)
		}
		daily = append(daily, FusionDay{
			Date:                date,
			TemperatureP10:      roundFusion(weightedQuantile(temperatures, .10), 1),
			TemperatureP25:      roundFusion(weightedQuantile(temperatures, .25), 1),
			TemperatureP50:      roundFusion(weightedQuantile(temperatures, .50), 1),
			TemperatureP75:      roundFusion(weightedQuantile(temperatures, .75), 1),
			TemperatureP90:      roundFusion(weightedQuantile(temperatures, .90), 1),
			PrecipitationP10:    roundFusion(weightedQuantile(precipitation, .10), 2),
			PrecipitationP50:    roundFusion(weightedQuantile(precipitation, .50), 2),
			PrecipitationP90:    roundFusion(weightedQuantile(precipitation, .90), 2),
			RainProbability1mm:  roundFusion(weightedProbabilityAtLeast(precipitation, 1)*100, 1),
			RainProbability10mm: roundFusion(weightedProbabilityAtLeast(precipitation, 10)*100, 1),
			ModelCount:          len(memberSets),
			MemberCount:         memberCount,
		})
	}

	return &Fusion{
		Method: "equal-model-weighted-empirical",
		Daily:  daily,
		Notice: "Rohfusion ohne historische Kalibrierung: Pro Tag erh\u00e4lt jedes verf\u00fcgbare Kurz- oder Mittelfristmodell dasselbe Gesamtgewicht; dessen Mitglieder teilen es gleichm\u00e4\u00dfig. EC46 bleibt als separate erweiterte Orientierung au\u00dferhalb der Tagesfusion.",
	}
}

func pairedFiniteMembers(temperatures, precipitation []float64) ([]float64, []float64) {
	count := len(temperatures)
	if len(precipitation) < count {
		count = len(precipitation)
	}
	cleanTemperatures := make([]float64, 0, count)
	cleanPrecipitation := make([]float64, 0, count)
	for index := 0; index < count; index++ {
		if !finite(temperatures[index]) || !finite(precipitation[index]) {
			continue
		}
		cleanTemperatures = append(cleanTemperatures, temperatures[index])
		cleanPrecipitation = append(cleanPrecipitation, precipitation[index])
	}
	return cleanTemperatures, cleanPrecipitation
}

func balancedSamples(models []fusionMemberSet) ([]weightedValue, []weightedValue) {
	if len(models) == 0 {
		return nil, nil
	}
	temperatures := make([]weightedValue, 0)
	precipitation := make([]weightedValue, 0)
	modelWeight := 1 / float64(len(models))
	for _, model := range models {
		if len(model.temperature) == 0 {
			continue
		}
		memberWeight := modelWeight / float64(len(model.temperature))
		for index := range model.temperature {
			temperatures = append(temperatures, weightedValue{value: model.temperature[index], weight: memberWeight})
			precipitation = append(precipitation, weightedValue{value: model.precipitation[index], weight: memberWeight})
		}
	}
	return temperatures, precipitation
}

func weightedQuantile(values []weightedValue, probability float64) float64 {
	ordered := make([]weightedValue, 0, len(values))
	for _, item := range values {
		if validWeightedValue(item) {
			ordered = append(ordered, item)
		}
	}
	if len(ordered) == 0 {
		return 0
	}
	sort.SliceStable(ordered, func(left, right int) bool { return ordered[left].value < ordered[right].value })
	totalWeight := 0.0
	for _, item := range ordered {
		totalWeight += item.weight
	}
	probability = math.Max(0, math.Min(1, probability))
	target := probability * totalWeight
	cumulative := 0.0
	for _, item := range ordered {
		cumulative += item.weight
		if cumulative >= target {
			return item.value
		}
	}
	return ordered[len(ordered)-1].value
}

func weightedProbabilityAtLeast(values []weightedValue, threshold float64) float64 {
	totalWeight, eventWeight := 0.0, 0.0
	for _, item := range values {
		if !validWeightedValue(item) {
			continue
		}
		totalWeight += item.weight
		if item.value >= threshold {
			eventWeight += item.weight
		}
	}
	if totalWeight == 0 {
		return 0
	}
	return eventWeight / totalWeight
}

func validWeightedValue(item weightedValue) bool {
	return item.weight > 0 && finite(item.weight) && finite(item.value)
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func roundFusion(value float64, precision int) float64 {
	factor := math.Pow10(precision)
	return math.Round(value*factor) / factor
}
