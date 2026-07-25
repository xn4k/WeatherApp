package location

import "context"

type Provider interface {
	Search(ctx context.Context, query string) ([]Result, error)
}
