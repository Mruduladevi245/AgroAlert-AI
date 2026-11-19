export interface GeocodedLocation {
  id: number;
  name: string;
  country: string;
  countryCode: string;
  admin1: string; // State / province
  admin2: string; // District / county
  latitude: number;
  longitude: number;
  timezone: string;
  elevation?: number;
  population?: number;
  postcodes?: string[];
  displayName: string;
}

export interface WeatherCurrent {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  weatherCode: number | null;
  weatherLabel: string;
  surfacePressureHpa: number | null;
  soilMoistureSurface: number | null;
  observedAt: string;
}

export interface WeatherHourlyPoint {
  time: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  rainProbabilityPercent: number | null;
  windSpeedKmh: number | null;
  weatherCode: number | null;
}

export interface WeatherDailyPoint {
  date: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationSumMm: number | null;
  rainProbabilityMaxPercent: number | null;
  windSpeedMaxKmh: number | null;
  sunrise: string | null;
  sunset: string | null;
  et0EvapotranspirationMm: number | null;
  weatherCode: number | null;
  weatherLabel: string;
}

export interface WeatherForecastResult {
  dataAvailable: boolean;
  source: string;
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneAbbreviation: string;
  lastUpdated: string;
  errorMessage?: string;
  current: WeatherCurrent | null;
  hourly: WeatherHourlyPoint[];
  daily: WeatherDailyPoint[];
}

export function wmoCodeToLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'Unknown';
  const map: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snowfall',
    73: 'Moderate snowfall',
    75: 'Heavy snowfall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return map[code] ?? `Weather code ${code}`;
}

export async function searchLocations(query: string, count = 10): Promise<{
  results: GeocodedLocation[];
  source: string;
  error?: string;
}> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return { results: [], source: 'Open-Meteo Geocoding API' };
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', String(Math.min(Math.max(count, 1), 20)));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      return {
        results: [],
        source: 'Open-Meteo Geocoding API',
        error: `Geocoding provider returned HTTP ${resp.status}`,
      };
    }

    const json = (await resp.json()) as {
      results?: Array<{
        id: number;
        name: string;
        country?: string;
        country_code?: string;
        admin1?: string;
        admin2?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
        elevation?: number;
        population?: number;
        postcodes?: string[];
      }>;
    };

    const items: GeocodedLocation[] = (json.results ?? []).map((r) => {
      const parts = [r.name, r.admin2, r.admin1, r.country].filter(Boolean);
      return {
        id: r.id,
        name: r.name,
        country: r.country ?? '',
        countryCode: r.country_code ?? '',
        admin1: r.admin1 ?? '',
        admin2: r.admin2 ?? '',
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone ?? 'auto',
        elevation: r.elevation,
        population: r.population,
        postcodes: r.postcodes,
        displayName: parts.join(', '),
      };
    });

    return { results: items, source: 'Open-Meteo Geocoding API' };
  } catch (err) {
    return {
      results: [],
      source: 'Open-Meteo Geocoding API',
      error: err instanceof Error ? err.message : 'Location search failed',
    };
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<{
  country: string;
  stateProvince: string;
  district: string;
  villageCity: string;
  postalCode: string;
  displayName: string;
  source: string;
}> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error('Invalid latitude or longitude coordinates.');
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('accept-language', 'en');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AgroAlertAI/1.0 (Agricultural Weather Platform)',
      },
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = (await resp.json()) as {
        display_name?: string;
        address?: {
          country?: string;
          state?: string;
          region?: string;
          state_district?: string;
          county?: string;
          city?: string;
          town?: string;
          village?: string;
          hamlet?: string;
          suburb?: string;
          postcode?: string;
        };
      };
      const addr = data.address ?? {};
      const villageCity = addr.village || addr.hamlet || addr.town || addr.city || addr.suburb || '';
      const district = addr.state_district || addr.county || '';
      const stateProvince = addr.state || addr.region || '';
      const country = addr.country || '';
      return {
        country,
        stateProvince,
        district,
        villageCity,
        postalCode: addr.postcode || '',
        displayName:
          [villageCity, district, stateProvince, country].filter(Boolean).join(', ') ||
          data.display_name ||
          `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        source: 'OpenStreetMap Nominatim',
      };
    }
  } catch {
    // Graceful coordinate fallback if reverse geocoder times out or is unavailable
  }

  return {
    country: '',
    stateProvince: '',
    district: '',
    villageCity: '',
    postalCode: '',
    displayName: `Coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    source: 'Coordinate Entry',
  };
}

export async function fetchWeather(
  lat: number,
  lon: number,
  timezone = 'auto'
): Promise<WeatherForecastResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return {
      dataAvailable: false,
      source: 'Open-Meteo Weather API',
      latitude: lat,
      longitude: lon,
      timezone: 'UTC',
      timezoneAbbreviation: 'UTC',
      lastUpdated: new Date().toISOString(),
      errorMessage: 'Coordinates out of valid Earth bounds (-90..90 latitude, -180..180 longitude).',
      current: null,
      hourly: [],
      daily: [],
    };
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('timezone', timezone || 'auto');
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'rain',
      'weather_code',
      'surface_pressure',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(',')
  );
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'soil_moisture_0_to_1cm',
    ].join(',')
  );
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'sunrise',
      'sunset',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'et0_fao_evapotranspiration',
    ].join(',')
  );
  url.searchParams.set('forecast_days', '7');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      let reason = `Open-Meteo API returned HTTP ${resp.status}`;
      try {
        const errBody = (await resp.json()) as { reason?: string };
        if (errBody?.reason) reason = errBody.reason;
      } catch {
        // ignore JSON parse error
      }
      return {
        dataAvailable: false,
        source: 'Open-Meteo Weather API',
        latitude: lat,
        longitude: lon,
        timezone: 'UTC',
        timezoneAbbreviation: 'UTC',
        lastUpdated: new Date().toISOString(),
        errorMessage: reason,
        current: null,
        hourly: [],
        daily: [],
      };
    }

    const data = (await resp.json()) as {
      latitude: number;
      longitude: number;
      timezone?: string;
      timezone_abbreviation?: string;
      error?: boolean;
      reason?: string;
      current?: {
        time: string;
        temperature_2m?: number | null;
        apparent_temperature?: number | null;
        relative_humidity_2m?: number | null;
        precipitation?: number | null;
        rain?: number | null;
        weather_code?: number | null;
        surface_pressure?: number | null;
        wind_speed_10m?: number | null;
        wind_direction_10m?: number | null;
      };
      hourly?: {
        time?: string[];
        temperature_2m?: Array<number | null>;
        relative_humidity_2m?: Array<number | null>;
        precipitation_probability?: Array<number | null>;
        precipitation?: Array<number | null>;
        weather_code?: Array<number | null>;
        wind_speed_10m?: Array<number | null>;
        soil_moisture_0_to_1cm?: Array<number | null>;
      };
      daily?: {
        time?: string[];
        weather_code?: Array<number | null>;
        temperature_2m_max?: Array<number | null>;
        temperature_2m_min?: Array<number | null>;
        sunrise?: Array<string | null>;
        sunset?: Array<string | null>;
        precipitation_sum?: Array<number | null>;
        precipitation_probability_max?: Array<number | null>;
        wind_speed_10m_max?: Array<number | null>;
        et0_fao_evapotranspiration?: Array<number | null>;
      };
    };

    if (data.error || !data.current) {
      return {
        dataAvailable: false,
        source: 'Open-Meteo Weather API',
        latitude: lat,
        longitude: lon,
        timezone: data.timezone ?? 'UTC',
        timezoneAbbreviation: data.timezone_abbreviation ?? 'UTC',
        lastUpdated: new Date().toISOString(),
        errorMessage: data.reason || 'Weather observations unavailable for these coordinates.',
        current: null,
        hourly: [],
        daily: [],
      };
    }

    const hourlyTimes = data.hourly?.time ?? [];
    const currentHourPrefix = data.current.time.slice(0, 13);
    let startIdx = hourlyTimes.findIndex((t) => t.startsWith(currentHourPrefix));
    if (startIdx < 0) startIdx = 0;

    const hourly: WeatherHourlyPoint[] = hourlyTimes.slice(startIdx, startIdx + 24).map((t, offset) => {
      const i = startIdx + offset;
      return {
        time: t,
        temperatureC: data.hourly?.temperature_2m?.[i] ?? null,
        humidityPercent: data.hourly?.relative_humidity_2m?.[i] ?? null,
        precipitationMm: data.hourly?.precipitation?.[i] ?? null,
        rainProbabilityPercent: data.hourly?.precipitation_probability?.[i] ?? null,
        windSpeedKmh: data.hourly?.wind_speed_10m?.[i] ?? null,
        weatherCode: data.hourly?.weather_code?.[i] ?? null,
      };
    });

    const dailyTimes = data.daily?.time ?? [];
    const daily: WeatherDailyPoint[] = dailyTimes.map((d, i) => {
      const code = data.daily?.weather_code?.[i] ?? null;
      return {
        date: d,
        tempMaxC: data.daily?.temperature_2m_max?.[i] ?? null,
        tempMinC: data.daily?.temperature_2m_min?.[i] ?? null,
        precipitationSumMm: data.daily?.precipitation_sum?.[i] ?? null,
        rainProbabilityMaxPercent: data.daily?.precipitation_probability_max?.[i] ?? null,
        windSpeedMaxKmh: data.daily?.wind_speed_10m_max?.[i] ?? null,
        sunrise: data.daily?.sunrise?.[i] ?? null,
        sunset: data.daily?.sunset?.[i] ?? null,
        et0EvapotranspirationMm: data.daily?.et0_fao_evapotranspiration?.[i] ?? null,
        weatherCode: code,
        weatherLabel: wmoCodeToLabel(code),
      };
    });

    const soilMoistureVal = data.hourly?.soil_moisture_0_to_1cm?.[startIdx] ?? null;

    return {
      dataAvailable: true,
      source: 'Open-Meteo Weather API',
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone ?? 'UTC',
      timezoneAbbreviation: data.timezone_abbreviation ?? 'UTC',
      lastUpdated: new Date().toISOString(),
      current: {
        temperatureC: data.current.temperature_2m ?? null,
        apparentTemperatureC: data.current.apparent_temperature ?? null,
        humidityPercent: data.current.relative_humidity_2m ?? null,
        precipitationMm: data.current.precipitation ?? null,
        rainMm: data.current.rain ?? null,
        windSpeedKmh: data.current.wind_speed_10m ?? null,
        windDirectionDeg: data.current.wind_direction_10m ?? null,
        weatherCode: data.current.weather_code ?? null,
        weatherLabel: wmoCodeToLabel(data.current.weather_code),
        surfacePressureHpa: data.current.surface_pressure ?? null,
        soilMoistureSurface: soilMoistureVal,
        observedAt: data.current.time,
      },
      hourly,
      daily,
    };
  } catch (err) {
    return {
      dataAvailable: false,
      source: 'Open-Meteo Weather API',
      latitude: lat,
      longitude: lon,
      timezone: 'UTC',
      timezoneAbbreviation: 'UTC',
      lastUpdated: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : 'Unable to reach Open-Meteo weather service.',
      current: null,
      hourly: [],
      daily: [],
    };
  }
}
