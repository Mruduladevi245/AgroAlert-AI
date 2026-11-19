# AgroAlert AI — Smart Extreme Weather Alert & Intelligent Crop Protection System

AgroAlert AI is a full-stack agricultural weather risk monitoring, manual standing-water tracking, AI crop symptom scanning, and multilingual voice assistant platform designed for farmers worldwide.

## Architecture Overview

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Recharts, Lucide React
- **Backend**: Node.js 22 + Express (`server.ts`) running REST APIs and Vite middleware on port 3000
- **Database**: Embedded SQLite (`node:sqlite` / `DatabaseSync`) with persistent tables for users, farmer profiles, farms, fields, crops, growth records, weather snapshots, risk assessments, manual water measurements, crop scans, recommendations, alerts, notifications, voice interactions, and WebAuthn passkeys
- **Weather & Geocoding**: Live Open-Meteo Weather & Geocoding APIs + OpenStreetMap Nominatim reverse geocoding
- **AI & Multilingual Voice**:
  - Google Gemini (`@google/genai`) server-side for agricultural Q&A (`gemini-4-hydrogen`), crop image vision analysis, alert translation, speech transcription (`gemini-3.5-transcribe`), and speech generation (`gemini-3.8-flash-lite-tts`)
  - Optional Google Cloud Text-to-Speech API (`GOOGLE_CLOUD_TTS_API_KEY`) for MP3 synthesis across Indian & international locales
  - Browser SpeechSynthesis / Web Speech API fallback where supported for matching locales
- **Notifications**: Twilio SMS REST integration with clearly labelled Demo Mode when credentials are not configured

## Project Structure

```
├── server.ts                        # Express entry point + Vite dev / production static server
├── server/
│   ├── db.ts                        # SQLite schema initialization, safe migrations, crop seeding
│   ├── auth.ts                      # scrypt password hashing, HMAC sessions, WebAuthn passkeys
│   ├── routes/
│   │   ├── authRoutes.ts            # Register, login, logout, password recovery, WebAuthn
│   │   ├── fieldWeatherRoutes.ts    # Farmer profile, farms/fields CRUD, geocoding, weather
│   │   ├── agriAiRoutes.ts          # Crops, risk analysis, crop scanner, water logs, alerts
│   │   └── voiceNotifyRoutes.ts     # Multilingual voice TTS/STT/assistant & SMS endpoints
│   └── services/
│       ├── weather.ts               # Open-Meteo geocoding, weather forecast, reverse geocode
│       ├── gemini.ts                # Server-side @google/genai client & rule-based fallback
│       ├── riskEngine.ts            # Combined crop + growth stage + weather + water risk engine
│       ├── voice.ts                 # Cloud TTS / Gemini TTS / STT capability orchestration
│       └── notifications.ts         # Twilio SMS dispatch & Demo Mode logger
├── shared/
│   ├── crops.ts                     # Global crop database & stage-specific water thresholds
│   └── languages.ts                 # Centralized 14-locale registry & UI translation map
├── src/
│   ├── App.tsx                      # Responsive sidebar + top bar + view router
│   ├── context/AppContext.tsx       # Auth, active field, weather/risk, language & theme state
│   ├── services/api.ts              # Typed REST client & audio blob fetcher
│   ├── components/                  # LocationPicker, AudioPlayerButton, VoiceAssistantDrawer
│   └── pages/                       # AuthPage, DashboardOverview, WeatherPage, FieldsPage,
│                                    # WaterPage, CropScannerPage, AlertsAnalyticsPage, ProfileSettingsPage
├── .env.example                     # Environment variable documentation
└── README.md
```

## Windows Installation & Run Commands

Ensure **Node.js 22+** is installed on Windows.

```powershell
# 1. Install dependencies
npm install

# 2. Copy environment template and add your server-side keys
copy .env.example .env

# 3. Start development server (Express + Vite on http://localhost:3000)
npm run dev

# 4. Build and run production server
npm run build
npm run start
```

## Required & Optional Environment Variables

- `GEMINI_API_KEY`: Enables Gemini agricultural assistant, crop vision scanner, alert translation, audio transcription, and Gemini 3.8 TTS. Without it, the app clearly activates rule-based guidance fallback.
- `GOOGLE_CLOUD_TTS_API_KEY` *(optional)*: Enables Google Cloud Text-to-Speech MP3 output for supported locales (`en-IN`, `kn-IN`, `hi-IN`, `te-IN`, `ta-IN`, `ml-IN`, `mr-IN`, `bn-IN`, `gu-IN`, `pa-IN`, `ur-IN`, `en-US`, `en-GB`).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` *(optional)*: Enables live SMS carrier delivery. Without them, SMS operates in clearly labelled Demo Mode.
- `SESSION_SECRET` *(optional)*: HMAC signing secret for session tokens.
- `SQLITE_DB_PATH` *(optional)*: Custom SQLite file path (defaults to `./data/agroalert.db`).

## Core REST API Endpoints

- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/webauthn/*`
- **Farmer & Fields**: `GET/PUT /api/farmer/profile`, `POST /api/farmer/farms`, `GET/POST /api/fields`, `PUT/DELETE /api/fields/:id`, `POST /api/fields/location`
- **Location & Weather**: `GET /api/location/search`, `GET /api/location/reverse-geocode`, `GET /api/weather`
- **Crops & AI**: `GET /api/crops/metadata`, `POST /api/analyze`, `POST /api/crop/scan`, `POST /api/recommendations/generate`
- **Water**: `POST/GET /api/water/measurements`, `PUT /api/water/measurements/:id`, `GET /api/water/assessment`
- **Voice**: `GET /api/voice/languages`, `POST /api/voice/generate`, `POST /api/voice/recognize`, `POST /api/voice/assistant`, `POST /api/voice/translate`
- **Alerts & SMS**: `GET /api/alerts`, `GET /api/alerts/history`, `POST /api/notifications/send`, `GET /api/notifications/history`
- **Health**: `GET /api/health`

## Known Limitations

- **Embedded iframe preview**: WebAuthn biometric passkeys and browser camera/microphone prompts may be restricted inside cross-origin preview iframes; open in a standalone HTTPS browser tab for full biometric enrollment.
- **Regional agricultural calibration**: Thresholds are calibrated for major crops across South Asia, UK, US, and global irrigated regions; regions outside the calibrated list display a transparent general-guidance notice.
- **Odia (`or-IN`) Google Cloud TTS**: Google Cloud TTS does not currently publish a standard `or-IN` voice in the standard list; AgroAlert AI routes `or-IN` speech synthesis through Gemini 3.8 TTS when `GEMINI_API_KEY` is configured.
