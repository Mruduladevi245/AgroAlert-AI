import { getCropById, getStageWaterThreshold, type GrowthStageId } from '../../shared/crops.ts';
import type { WeatherForecastResult } from './weather.ts';

export type RiskSeverity = 'GREEN' | 'ORANGE' | 'RED';

export interface RiskAlertItem {
  category: string;
  severity: RiskSeverity;
  title: string;
  evidence: string;
  affectedCrop: string;
  growthStage: string;
  fieldLocation: string;
  assessmentTime: string;
  recommendedActions: string[];
  dataSource: string;
  uncertainty: string;
}

export interface RiskEvaluationOutput {
  overallLevel: RiskSeverity;
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

export interface WaterAssessmentSummary {
  status: RiskSeverity;
  headline: string;
  standingWaterCm: number | null;
  optimalRangeCm: [number, number];
  guidance: string;
}

export function evaluateWaterLevel(
  cropId: string,
  stageId: GrowthStageId,
  standingWaterCm: number | null
): WaterAssessmentSummary {
  const crop = getCropById(cropId);
  const threshold = getStageWaterThreshold(crop.id, stageId);

  if (standingWaterCm === null || !Number.isFinite(standingWaterCm)) {
    return {
      status: 'GREEN',
      headline: 'No standing water measurements recorded yet',
      standingWaterCm: null,
      optimalRangeCm: [threshold.minStandingWaterCm, threshold.maxStandingWaterCm],
      guidance: threshold.guidance,
    };
  }

  if (standingWaterCm >= threshold.criticalExcessCm) {
    return {
      status: 'RED',
      headline: `Critical waterlogging risk (${standingWaterCm.toFixed(1)} cm standing water)`,
      standingWaterCm,
      optimalRangeCm: [threshold.minStandingWaterCm, threshold.maxStandingWaterCm],
      guidance: `${crop.name} at ${stageId.replace(/_/g, ' ')} stage exceeds critical excess threshold (${threshold.criticalExcessCm} cm). Open field bunds or drainage channels immediately.`,
    };
  }

  if (standingWaterCm > threshold.maxStandingWaterCm) {
    return {
      status: 'ORANGE',
      headline: `Elevated standing water (${standingWaterCm.toFixed(1)} cm vs ${threshold.maxStandingWaterCm} cm max)`,
      standingWaterCm,
      optimalRangeCm: [threshold.minStandingWaterCm, threshold.maxStandingWaterCm],
      guidance: threshold.guidance,
    };
  }

  if (threshold.requiresStandingWater && standingWaterCm < threshold.minStandingWaterCm) {
    const severity: RiskSeverity = standingWaterCm === 0 ? 'ORANGE' : 'ORANGE';
    return {
      status: severity,
      headline: `Standing water below target (${standingWaterCm.toFixed(1)} cm vs ${threshold.minStandingWaterCm}–${threshold.maxStandingWaterCm} cm)`,
      standingWaterCm,
      optimalRangeCm: [threshold.minStandingWaterCm, threshold.maxStandingWaterCm],
      guidance: `Manual reading shows low water for ${crop.name} (${stageId.replace(/_/g, ' ')}). Schedule supplemental irrigation if rootzone soil is drying.`,
    };
  }

  return {
    status: 'GREEN',
    headline: `Optimal field water level (${standingWaterCm.toFixed(1)} cm)`,
    standingWaterCm,
    optimalRangeCm: [threshold.minStandingWaterCm, threshold.maxStandingWaterCm],
    guidance: threshold.guidance,
  };
}

const REGIONALLY_SUPPORTED_COUNTRIES = new Set([
  'india',
  'united kingdom',
  'uk',
  'united states',
  'usa',
  'bangladesh',
  'nepal',
  'pakistan',
  'sri lanka',
  'kenya',
  'nigeria',
  'vietnam',
  'thailand',
  'indonesia',
  'philippines',
]);

export function evaluateFieldRisk(params: {
  fieldName: string;
  locationLabel: string;
  country: string;
  cropId: string;
  growthStage: GrowthStageId;
  weather: WeatherForecastResult;
  latestWaterCm: number | null;
  latestWaterTime?: string;
  recentScanSummary?: string;
}): RiskEvaluationOutput {
  const crop = getCropById(params.cropId);
  const nowIso = new Date().toISOString();
  const alerts: RiskAlertItem[] = [];
  const dataSources: string[] = [];

  const isLocal = REGIONALLY_SUPPORTED_COUNTRIES.has((params.country || '').trim().toLowerCase());
  const regionalGuidanceNote = isLocal
    ? `Thresholds calibrated for ${crop.name} (${params.growthStage.replace(/_/g, ' ')}) using regional agronomic parameters for ${params.country}.`
    : `General agronomic guidance applied for ${crop.name}: locally validated regional thresholds for "${params.country || 'this area'}" are not registered in the database.`;

  if (params.latestWaterCm !== null) {
    dataSources.push('Manual Field Water Entry (MANUAL)');
  }
  if (params.recentScanSummary) {
    dataSources.push('AI Crop Vision Scan');
  }

  if (!params.weather.dataAvailable || !params.weather.current) {
    alerts.push({
      category: 'Weather Data Unavailable',
      severity: 'ORANGE',
      title: 'Live weather telemetry unavailable for this location',
      evidence: params.weather.errorMessage || 'Weather provider did not return observations.',
      affectedCrop: crop.name,
      growthStage: params.growthStage,
      fieldLocation: params.locationLabel,
      assessmentTime: nowIso,
      recommendedActions: [
        'Verify field coordinates or retry weather sync.',
        'Rely on manual field inspection and local rain gauge readings until weather service recovers.',
      ],
      dataSource: params.weather.source,
      uncertainty: 'No weather forecast was substituted or fabricated.',
    });
  } else {
    dataSources.push(params.weather.source);
    const cur = params.weather.current;
    const next24hRain = params.weather.hourly
      .slice(0, 24)
      .reduce((sum, h) => sum + (h.precipitationMm ?? 0), 0);
    const next48hRain = params.weather.daily
      .slice(0, 2)
      .reduce((sum, d) => sum + (d.precipitationSumMm ?? 0), 0);
    const max7dTemp = Math.max(
      cur.temperatureC ?? -99,
      ...params.weather.daily.map((d) => d.tempMaxC ?? -99)
    );
    const min7dTemp = Math.min(
      cur.temperatureC ?? 99,
      ...params.weather.daily.map((d) => d.tempMinC ?? 99)
    );
    const max7dWind = Math.max(
      cur.windSpeedKmh ?? 0,
      ...params.weather.daily.map((d) => d.windSpeedMaxKmh ?? 0)
    );

    // 1. Heavy Rainfall & Flood-Related Weather Risk
    if (next24hRain >= crop.heavyRain24hMm * 1.5 || next48hRain >= crop.heavyRain24hMm * 2.2) {
      alerts.push({
        category: 'Heavy Rainfall & Flood-Related Weather Risk',
        severity: 'RED',
        title: `Heavy rainfall forecast (${next24hRain.toFixed(1)} mm in next 24h)`,
        evidence: `Forecast precipitation: ${next24hRain.toFixed(1)} mm over 24h and ${next48hRain.toFixed(1)} mm over 48h (crop threshold: ${crop.heavyRain24hMm} mm/24h).`,
        affectedCrop: crop.name,
        growthStage: params.growthStage,
        fieldLocation: params.locationLabel,
        assessmentTime: nowIso,
        recommendedActions: [
          'Clear surface drainage channels and bund spillways before rainfall arrives.',
          'Postpone fertilizer top-dressing and foliar pesticide spraying.',
          'Monitor low-lying field corners for runoff accumulation.',
        ],
        dataSource: params.weather.source,
        uncertainty: 'Forecast indicates meteorological heavy rainfall risk; it does not confirm an active riverine or basin flood.',
      });
    } else if (next24hRain >= crop.heavyRain24hMm * 0.75) {
      alerts.push({
        category: 'Rainfall Advisory',
        severity: 'ORANGE',
        title: `Moderate-to-heavy rain expected (${next24hRain.toFixed(1)} mm / 24h)`,
        evidence: `Predicted 24h rainfall is ${next24hRain.toFixed(1)} mm.`,
        affectedCrop: crop.name,
        growthStage: params.growthStage,
        fieldLocation: params.locationLabel,
        assessmentTime: nowIso,
        recommendedActions: [
          'Pause planned irrigation to prevent excess moisture.',
          'Check field outlet gates and bund height.',
        ],
        dataSource: params.weather.source,
        uncertainty: 'Short-range numerical forecast; rainfall intensity can vary locally.',
      });
    }

    // 2. Extreme Heat & Sudden Temperature Drop
    if (max7dTemp >= crop.heatStressTempC) {
      const isNow = (cur.temperatureC ?? -99) >= crop.heatStressTempC;
      const isFlowering = params.growthStage === 'flowering' || params.growthStage === 'grain_fruit_formation';
      alerts.push({
        category: 'Extreme Heat Stress',
        severity: isNow || isFlowering ? 'RED' : 'ORANGE',
        title: `${isNow ? 'Measured' : 'Forecast'} extreme heat (${max7dTemp.toFixed(1)}°C)`,
        evidence: `${isNow ? 'Observed current temp' : 'Peak 7-day forecast temp'} reaches ${max7dTemp.toFixed(1)}°C (crop heat stress limit: ${crop.heatStressTempC}°C).`,
        affectedCrop: crop.name,
        growthStage: params.growthStage,
        fieldLocation: params.locationLabel,
        assessmentTime: nowIso,
        recommendedActions: [
          'Irrigate during early morning or late evening to reduce evaporative loss.',
          'Apply organic mulch where feasible to moderate rootzone heat.',
          isFlowering ? 'High heat during flowering risks spikelet/blossom sterility; prioritize cooling irrigation.' : 'Monitor leaf wilting at midday.',
        ],
        dataSource: params.weather.source,
        uncertainty: isNow ? 'Measured ambient station/model reading.' : 'Forecast peak temperature; microclimate canopy temp may differ by 1–3°C.',
      });
    }

    if (min7dTemp <= crop.coldStressTempC) {
      alerts.push({
        category: 'Cold Stress / Sudden Temperature Drop',
        severity: min7dTemp <= 0 ? 'RED' : 'ORANGE',
        title: `Low temperature risk (${min7dTemp.toFixed(1)}°C)`,
        evidence: `Minimum 7-day temperature drops to ${min7dTemp.toFixed(1)}°C (cold threshold: ${crop.coldStressTempC}°C).`,
        affectedCrop: crop.name,
        growthStage: params.growthStage,
        fieldLocation: params.locationLabel,
        assessmentTime: nowIso,
        recommendedActions: [
          'Provide light evening irrigation if frost is possible to stabilize soil heat.',
          'Delay transplanting young seedlings until cold snap passes.',
        ],
        dataSource: params.weather.source,
        uncertainty: 'Low-lying hollows may experience 1–2°C colder temperatures than grid average.',
      });
    }

    // Sudden diurnal or 24h temperature swing
    if (params.weather.daily.length >= 2) {
      const todayMax = params.weather.daily[0]?.tempMaxC;
      const tomorrowMax = params.weather.daily[1]?.tempMaxC;
      if (todayMax !== null && tomorrowMax !== null && Math.abs(todayMax - tomorrowMax) >= 8) {
        alerts.push({
          category: 'Sudden Temperature Shift',
          severity: 'ORANGE',
          title: `Rapid day-to-day temperature swing (${Math.abs(todayMax - tomorrowMax).toFixed(1)}°C)`,
          evidence: `Forecast daytime high shifts from ${todayMax.toFixed(1)}°C to ${tomorrowMax.toFixed(1)}°C within 24 hours.`,
          affectedCrop: crop.name,
          growthStage: params.growthStage,
          fieldLocation: params.locationLabel,
          assessmentTime: nowIso,
          recommendedActions: ['Monitor tender shoots and flowering canopy for shock stress.'],
          dataSource: params.weather.source,
          uncertainty: 'Forecast transition estimate.',
        });
      }
    }

    // 3. Strong Wind & Lodging Risk
    if (max7dWind >= crop.strongWindKmh) {
      const severity: RiskSeverity = max7dWind >= crop.strongWindKmh * 1.35 ? 'RED' : 'ORANGE';
      alerts.push({
        category: 'Strong Wind & Lodging Risk',
        severity,
        title: `Strong winds up to ${max7dWind.toFixed(0)} km/h expected`,
        evidence: `Peak wind speed reaches ${max7dWind.toFixed(1)} km/h (crop threshold: ${crop.strongWindKmh} km/h).`,
        affectedCrop: crop.name,
        growthStage: params.growthStage,
        fieldLocation: params.locationLabel,
        assessmentTime: nowIso,
        recommendedActions: [
          'Avoid standing deep water in tall crops during high winds to reduce root lodging.',
          'Suspend all foliar spraying to prevent chemical drift.',
          'Stake or reinforce tall horticultural crops (tomato, sugarcane).',
        ],
        dataSource: params.weather.source,
        uncertainty: '10m open-terrain wind estimate; local gusts near ridges may be higher.',
      });
    }

    // 4. Dry Conditions (only when 7-day forecast shows near-zero rain AND high ET0 / low soil moisture)
    const total7dRain = params.weather.daily.reduce((s, d) => s + (d.precipitationSumMm ?? 0), 0);
    const avgEt0 =
      params.weather.daily.reduce((s, d) => s + (d.et0EvapotranspirationMm ?? 0), 0) /
      Math.max(1, params.weather.daily.length);
    if (total7dRain < 2 && avgEt0 >= 4.0) {
      alerts.push({
        category: 'Dry Conditions & Water Deficit Forecast',
        severity: 'ORANGE',
        title: `Dry 7-day outlook (${total7dRain.toFixed(1)} mm total rain, high evaporation)`,
        evidence: `Forecast shows ${total7dRain.toFixed(1)} mm rainfall over 7 days with average reference evapotranspiration ${avgEt0.toFixed(1)} mm/day.`,
        affectedCrop: crop.name,
        growthStage: params.growthStage,
        fieldLocation: params.locationLabel,
        assessmentTime: nowIso,
        recommendedActions: [
          'Plan scheduled irrigation based on rootzone moisture check.',
          'Conserve soil moisture using mulch or evening irrigation.',
        ],
        dataSource: params.weather.source,
        uncertainty: '7-day dry forecast alone does not confirm historical meteorological drought without multi-week rainfall records.',
      });
    }
  }

  // 5. Manual Water-Level Risk Evaluation
  const waterEval = evaluateWaterLevel(crop.id, params.growthStage, params.latestWaterCm);
  if (waterEval.standingWaterCm !== null && waterEval.status !== 'GREEN') {
    alerts.push({
      category: waterEval.standingWaterCm > waterEval.optimalRangeCm[1] ? 'Waterlogging Risk' : 'Water Shortage Risk',
      severity: waterEval.status,
      title: waterEval.headline,
      evidence: `Measured manual standing water depth: ${waterEval.standingWaterCm.toFixed(1)} cm (recorded ${params.latestWaterTime || 'recently'}). Optimal range for ${crop.name} at ${params.growthStage.replace(/_/g, ' ')}: ${waterEval.optimalRangeCm[0]}–${waterEval.optimalRangeCm[1]} cm.`,
      affectedCrop: crop.name,
      growthStage: params.growthStage,
      fieldLocation: params.locationLabel,
      assessmentTime: nowIso,
      recommendedActions: [waterEval.guidance],
      dataSource: 'Manual Field Water Measurement (MANUAL)',
      uncertainty: 'Point measurement recorded manually by farmer; verify across multiple field checks.',
    });
  }

  // 6. Recent Crop Scan Risk
  if (params.recentScanSummary && params.recentScanSummary.toLowerCase().includes('high')) {
    alerts.push({
      category: 'Crop Health Stress',
      severity: 'ORANGE',
      title: 'Recent crop image scan flagged potential symptom stress',
      evidence: params.recentScanSummary,
      affectedCrop: crop.name,
      growthStage: params.growthStage,
      fieldLocation: params.locationLabel,
      assessmentTime: nowIso,
      recommendedActions: [
        'Verify visual symptoms across 5–10 plants in the field before applying treatment.',
        'Cross-check humidity and rainfall forecast before spraying.',
      ],
      dataSource: 'AI Crop Scanner',
      uncertainty: 'Image-based screening only; confirm with physical leaf inspection.',
    });
  }

  // Normal GREEN summary if no warnings triggered
  if (alerts.length === 0) {
    alerts.push({
      category: 'Normal Field Conditions',
      severity: 'GREEN',
      title: `Favorable weather and water profile for ${crop.name}`,
      evidence: params.weather.current
        ? `Current temp ${params.weather.current.temperatureC?.toFixed(1) ?? '--'}°C, humidity ${params.weather.current.humidityPercent ?? '--'}%, wind ${params.weather.current.windSpeedKmh?.toFixed(1) ?? '--'} km/h.`
        : 'Field parameters within normal bounds.',
      affectedCrop: crop.name,
      growthStage: params.growthStage,
      fieldLocation: params.locationLabel,
      assessmentTime: nowIso,
      recommendedActions: [
        `Continue standard ${params.growthStage.replace(/_/g, ' ')} stage management for ${crop.name}.`,
        'Log standing water depth manually after rainfall or irrigation events.',
      ],
      dataSource: dataSources.join(' + ') || 'AgroAlert Risk Engine',
      uncertainty: 'Conditions remain subject to short-term weather changes.',
    });
  }

  const overallLevel: RiskSeverity = alerts.some((a) => a.severity === 'RED')
    ? 'RED'
    : alerts.some((a) => a.severity === 'ORANGE')
      ? 'ORANGE'
      : 'GREEN';

  const summary =
    overallLevel === 'RED'
      ? `CRITICAL ACTION REQUIRED: ${alerts.filter((a) => a.severity === 'RED').map((a) => a.title).join('; ')}`
      : overallLevel === 'ORANGE'
        ? `WARNING: ${alerts.filter((a) => a.severity === 'ORANGE').map((a) => a.title).join('; ')}`
        : `NORMAL: Weather and field indicators are within safe operating bounds for ${crop.name}.`;

  return {
    overallLevel,
    cropId: crop.id,
    cropName: crop.name,
    growthStage: params.growthStage,
    regionalGuidanceNote,
    isLocallyValidated: isLocal,
    summary,
    alerts,
    dataSources,
    assessedAt: nowIso,
  };
}
