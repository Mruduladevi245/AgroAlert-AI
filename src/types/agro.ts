export interface FarmerUser {
  id: number;
  email: string | null;
  phone: string | null;
  created_at?: string;
}

export interface FarmerProfile {
  id: number;
  user_id: number;
  full_name: string;
  country: string;
  state_region: string;
  district: string;
  village_city: string;
  preferred_language: string;
  temp_unit: 'C' | 'F';
  rain_unit: 'mm' | 'cm' | 'in';
  area_unit: 'hectares' | 'acres';
  wind_unit: 'kmh' | 'mph' | 'ms';
  depth_unit: 'cm' | 'mm' | 'in';
  sms_consent: number;
  auto_voice_alerts: number;
}

export interface FarmRecord {
  id: number;
  user_id: number;
  name: string;
  country: string;
  region: string;
  notes: string;
}

export interface FieldRecord {
  id: number;
  user_id: number;
  farm_id: number | null;
  farm_name?: string;
  name: string;
  country: string;
  state_province: string;
  district: string;
  village_city: string;
  postal_code: string;
  latitude: number;
  longitude: number;
  timezone: string;
  area_value: number;
  area_unit: 'hectares' | 'acres';
  soil_type: string;
  irrigation_method: string;
  crop_id: string;
  growth_stage: string;
  planting_date: string;
  expected_harvest_date: string;
  is_preferred: number;
}

export interface GeocodedResult {
  id: number;
  name: string;
  country: string;
  countryCode: string;
  admin1: string;
  admin2: string;
  latitude: number;
  longitude: number;
  timezone: string;
  postcodes?: string[];
  displayName: string;
}

export interface WeatherForecast {
  dataAvailable: boolean;
  source: string;
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneAbbreviation: string;
  lastUpdated: string;
  errorMessage?: string;
  current: {
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
  } | null;
  hourly: Array<{
    time: string;
    temperatureC: number | null;
    humidityPercent: number | null;
    precipitationMm: number | null;
    rainProbabilityPercent: number | null;
    windSpeedKmh: number | null;
    weatherCode: number | null;
  }>;
  daily: Array<{
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
  }>;
}

export interface RiskAlertItem {
  category: string;
  severity: 'GREEN' | 'ORANGE' | 'RED';
  title: string;
  evidence: string;
  affectedCrop: string;
  growthStage: string;
  fieldLocation: string;
  assessmentTime: string;
  recommendedActions: string[];
  dataSource: string;
  uncertainty: string;
  languageCode?: string;
  translatedText?: string;
}

export interface RiskEvaluation {
  overallLevel: 'GREEN' | 'ORANGE' | 'RED';
  cropId: string;
  cropName: string;
  growthStage: string;
  regionalGuidanceNote: string;
  isLocallyValidated: boolean;
  summary: string;
  alerts: RiskAlertItem[];
  dataSources: string[];
  assessedAt: string;
}

export interface WaterMeasurement {
  id: number;
  field_id: number;
  crop_id: string;
  growth_stage: string;
  standing_water_cm: number;
  original_value: number;
  original_unit: 'cm' | 'mm' | 'in';
  source: string;
  notes: string;
  measured_at: string;
}

export interface WaterAssessment {
  status: 'GREEN' | 'ORANGE' | 'RED';
  headline: string;
  standingWaterCm: number | null;
  optimalRangeCm: [number, number];
  guidance: string;
}

export interface LanguageCapability {
  code: string;
  label: string;
  nativeLabel: string;
  rtl: boolean;
  translationAvailable: boolean;
  translationProvider: string;
  sttServerAvailable: boolean;
  sttProvider: string;
  browserSttHint: boolean;
  ttsServerAvailable: boolean;
  ttsProvider: string;
  googleCloudVoices: string[];
  geminiTtsAvailable: boolean;
}
