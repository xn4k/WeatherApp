package weather

import "context"

type Provider interface {
	Forecast(ctx context.Context, coordinates Coordinates) ([]ModelForecast, string, error)
}
