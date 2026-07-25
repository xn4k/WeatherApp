package location

import (
	"context"
	"errors"
	"strings"
)

type Service struct {
	provider Provider
}

func NewService(provider Provider) *Service {
	return &Service{provider: provider}
}

func (s *Service) Search(ctx context.Context, query string) ([]Result, error) {
	query = strings.TrimSpace(query)
	if len([]rune(query)) < 2 {
		return nil, errors.New("search query must contain at least two characters")
	}
	return s.provider.Search(ctx, query)
}
