# Sole Resolver Architecture

## Design Principles

1. **Resolver architecture, NOT catalog database** - We don't store all sneaker data, we resolve queries through multiple sources
2. **Reliability-first** - Multiple fallback sources, caching, graceful degradation
3. **Multi-source resolution** - Cache → KicksDB → Sneaks-API, with future extensibility
4. **Cache intelligence aggressively** - Successful resolutions are cached to reduce external API calls
5. **Normalize rather than scrape** - Parse structured data from API responses, no HTML scraping
6. **Stability over completeness** - Better to return nothing than wrong data
7. **Extensible over rigid** - Easy to add new resolvers, brands, patterns

## Data Flow

```
[Image] → /scan endpoint
    ↓
[Google Cloud Vision OCR]
    ↓
[Raw Text] → [SKU Classifier] → extracts SKU, size, brand hint
    ↓
[SKU] → /resolve endpoint
    ↓
[Resolver Chain]
    1. Check local SQLite cache (fastest)
    2. Query KicksDB API (best data)
    3. Query Sneaks-API (free fallback)
    ↓
[Normalizer] → Extracts brand, model, colorway from title
    ↓
[Confidence Scorer] → Calculates match confidence
    ↓
[Cache successful results]
    ↓
[Return structured response]
```

## SKU Classification

The classifier uses regex patterns to detect brand from SKU format:

- **Nike/Jordan**: `[A-Z]{2}[0-9]{4}-[0-9]{3}` (e.g., CT8527-100)
- **Adidas**: `[A-Z]{2}[0-9]{4}` (e.g., GX1234)
- **New Balance**: `[MW][0-9]{3,4}[A-Z]{2,3}` (e.g., M990GL5)

This helps:
- Validate inputs
- Route to appropriate resolver
- Improve confidence scoring

## Confidence Scoring

Confidence is calculated from multiple signals:

| Signal | Weight |
|--------|--------|
| SKU pattern match | 30% |
| Exact SKU match from API | 25% |
| Source reliability | 15% |
| Has brand info | 10% |
| Has model info | 10% |
| Has colorway info | 10% |

Results with confidence < 0.5 are not cached.

## Caching Strategy

- SQLite-based local cache
- 30-day TTL (configurable)
- Tracks access frequency for future optimization
- Only caches results with confidence ≥ 0.5

## Future Extensibility

The architecture supports:

- **New resolvers**: Add new files in `/src/resolvers/`
- **New brands**: Update patterns in `/src/classifiers/sku-classifier.js`
- **Image-based resolution**: Future capability via Vision API
- **Batch resolution**: Add batch endpoint
- **Pricing data**: Resolvers already capture raw data including prices
