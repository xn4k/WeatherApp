package weather

import (
	"context"
	"fmt"
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
	Date                string  `json:"date"`
	TemperatureMedian   float64 `json:"temperatureMedian"`
	TemperatureP10      float64 `json:"temperatureP10"`
	TemperatureP90      float64 `json:"temperatureP90"`
	PrecipitationMedian float64 `json:"precipitationMedian"`
	PrecipitationP10    float64 `json:"precipitationP10"`
	PrecipitationP90    float64 `json:"precipitationP90"`
}

type EnsembleModel struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Short       string        `json:"short"`
	MemberCount int           `json:"memberCount"`
	Daily       []EnsembleDay `json:"daily"`
}

type Outlook struct {
	Mode        string          `json:"mode"`
	HorizonDays int             `json:"horizonDays"`
	Models      []OutlookModel  `json:"models,omitempty"`
	Ensembles   []EnsembleModel `json:"ensembles,omitempty"`
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
