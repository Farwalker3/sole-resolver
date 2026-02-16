# Sole Resolver

Universal shoe style code & SKU resolver API. Convert product identifiers into structured footwear metadata.

## Features

- **OCR Integration**: Extract SKU and size from shoe tag photos using Google Cloud Vision
- **Multi-Source Resolution**: Looks up sneakers via KicksDB, Sneaks-API, with local caching
- **Smart Classification**: Automatically detects brand from SKU pattern
- **Confidence Scoring**: Returns how confident the system is in its match
- **Built-in Caching**: Successful lookups are cached to reduce API calls

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
KICKSDB_API_KEY=your_key_here
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### 3. Run Locally

```bash
npm run dev
```

API available at `http://localhost:3000`

## API Endpoints

### POST /resolve
Resolve a SKU to sneaker metadata.

```bash
curl -X POST http://localhost:3000/resolve \
  -H "Content-Type: application/json" \
  -d '{"query": "DD1391-100"}'
```

Response:
```json
{
  "success": true,
  "resolved": {
    "brand": "Nike",
    "name": "Nike Dunk Low Retro White Black Panda",
    "model": "Dunk Low",
    "colorway": "Panda"
  },
  "confidence": 0.92,
  "source": "kicksdb"
}
```

### POST /scan
OCR + Resolve in one call (for mobile app).

```json
{"image": "base64_encoded_image_data"}
```

### GET /health
Health check endpoint.

## Deployment

### Railway (Recommended)
1. Push code to GitHub
2. Create new project on [Railway](https://railway.app)
3. Connect your repo
4. Add environment variables:
   - `KICKSDB_API_KEY`
   - `GOOGLE_CREDENTIALS_BASE64` (base64 encoded service account JSON)
5. Deploy

### Render
1. Push code to GitHub
2. Create Web Service on [Render](https://render.com)
3. Set build: `npm install`, start: `npm start`
4. Add environment variables
5. Deploy

## Google Cloud Vision Setup (for OCR)

1. Enable Cloud Vision API in [Google Cloud Console](https://console.cloud.google.com)
2. Create service account with Cloud Vision User role
3. Download JSON key
4. Set `GOOGLE_APPLICATION_CREDENTIALS` (local) or `GOOGLE_CREDENTIALS_BASE64` (cloud)

```bash
# Encode for cloud deployment
base64 -i your-service-account.json
```

## Google Apps Script Integration

Updated files in `/google-apps-script/`:

1. Open your Google Sheet > Extensions > Apps Script
2. Replace `Code.gs` and `index.html` with files from this repo
3. Deploy as web app
4. Open app, go to Settings, enter your Sole Resolver API URL

## Supported Brands

| Brand | SKU Pattern | Example |
|-------|-------------|---------|
| Nike/Jordan | `XXXXXX-XXX` | DD1391-100 |
| Adidas | `XXXXXX` | GX1234 |
| New Balance | `MXXXXXX` | M990GL5 |
| Puma | `XXXXXX-XX` | 384692-01 |
| Converse | `XXXXXXC` | 162050C |
| Vans | `VN0AXXXXXXX` | VN0A38F7PXP |

## Project Structure

```
/sole-resolver
├── src/
│   ├── index.js              # Entry point
│   ├── routes/               # API endpoints
│   ├── classifiers/          # SKU pattern detection
│   ├── resolvers/            # Data sources (KicksDB, Sneaks)
│   ├── services/             # OCR, normalizer
│   ├── db/                   # SQLite cache
│   └── utils/                # Validation, confidence
├── google-apps-script/       # Updated Google Apps Script
├── docs/                     # Architecture docs
└── package.json
```

## License

MIT
