export type GrowthStageId =
  | 'land_preparation'
  | 'sowing'
  | 'germination'
  | 'seedling'
  | 'vegetative'
  | 'flowering'
  | 'grain_fruit_formation'
  | 'maturity'
  | 'harvest';

export interface GrowthStageDef {
  id: GrowthStageId;
  label: string;
  description: string;
}

export const ALL_GROWTH_STAGES: Record<GrowthStageId, GrowthStageDef> = {
  land_preparation: {
    id: 'land_preparation',
    label: 'Land Preparation',
    description: 'Tillage, bunding, leveling, and basal soil conditioning.',
  },
  sowing: {
    id: 'sowing',
    label: 'Sowing / Transplanting',
    description: 'Seed placement or nursery seedling transplanting.',
  },
  germination: {
    id: 'germination',
    label: 'Germination',
    description: 'Radicle emergence and early sprout establishment.',
  },
  seedling: {
    id: 'seedling',
    label: 'Seedling',
    description: 'Early root establishment and primary leaf expansion.',
  },
  vegetative: {
    id: 'vegetative',
    label: 'Vegetative / Tillering',
    description: 'Rapid canopy, stem, or tiller development.',
  },
  flowering: {
    id: 'flowering',
    label: 'Flowering / Pollination',
    description: 'Anthesis, panicle emergence, or blossom pollination.',
  },
  grain_fruit_formation: {
    id: 'grain_fruit_formation',
    label: 'Grain / Fruit Formation',
    description: 'Pod/grain filling, tuber bulking, or fruit sizing.',
  },
  maturity: {
    id: 'maturity',
    label: 'Physiological Maturity',
    description: 'Ripening, dry-down, and nutrient translocation completion.',
  },
  harvest: {
    id: 'harvest',
    label: 'Harvest',
    description: 'Crop cutting, picking, threshing, and post-harvest drying.',
  },
};

export interface StageWaterThreshold {
  minStandingWaterCm: number;
  maxStandingWaterCm: number;
  criticalExcessCm: number;
  requiresStandingWater: boolean;
  guidance: string;
}

export interface CropMetadata {
  id: string;
  name: string;
  scientificName: string;
  category: 'Cereal' | 'Millet' | 'Cash Crop' | 'Oilseed' | 'Vegetable' | 'Pulse';
  regions: string[];
  stages: GrowthStageId[];
  optimalTempC: [number, number];
  heatStressTempC: number;
  coldStressTempC: number;
  heavyRain24hMm: number;
  strongWindKmh: number;
  drySpellDaysWarning: number;
  waterNote: string;
  stageWaterThresholds: Partial<Record<GrowthStageId, StageWaterThreshold>>;
}

export const CROP_DATABASE: CropMetadata[] = [
  {
    id: 'rice',
    name: 'Rice (Paddy)',
    scientificName: 'Oryza sativa',
    category: 'Cereal',
    regions: ['South Asia', 'Southeast Asia', 'East Asia', 'West Africa', 'Global Irrigated'],
    stages: ['land_preparation', 'sowing', 'seedling', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [20, 34],
    heatStressTempC: 37,
    coldStressTempC: 15,
    heavyRain24hMm: 50,
    strongWindKmh: 45,
    drySpellDaysWarning: 5,
    waterNote: 'Lowland paddy tolerates shallow standing water during vegetative and flowering stages, but deep submergence (>15 cm) or standing water at maturity harms yield.',
    stageWaterThresholds: {
      land_preparation: { minStandingWaterCm: 2, maxStandingWaterCm: 6, criticalExcessCm: 15, requiresStandingWater: true, guidance: 'Maintain 2–6 cm water for puddling and leveling.' },
      sowing: { minStandingWaterCm: 0, maxStandingWaterCm: 2, criticalExcessCm: 8, requiresStandingWater: false, guidance: 'Keep soil saturated without deep water during direct seeding or transplanting.' },
      seedling: { minStandingWaterCm: 1, maxStandingWaterCm: 4, criticalExcessCm: 10, requiresStandingWater: true, guidance: 'Maintain 1–4 cm shallow water to protect young seedlings from desiccation.' },
      vegetative: { minStandingWaterCm: 2, maxStandingWaterCm: 5, criticalExcessCm: 15, requiresStandingWater: true, guidance: 'Keep 2–5 cm standing water to support active tillering and suppress weeds.' },
      flowering: { minStandingWaterCm: 3, maxStandingWaterCm: 6, criticalExcessCm: 18, requiresStandingWater: true, guidance: 'Maintain 3–6 cm water; moisture stress during flowering causes spikelet sterility.' },
      grain_fruit_formation: { minStandingWaterCm: 1, maxStandingWaterCm: 4, criticalExcessCm: 12, requiresStandingWater: true, guidance: 'Gradually reduce standing water to 1–4 cm during milk/dough grain filling.' },
      maturity: { minStandingWaterCm: 0, maxStandingWaterCm: 0.5, criticalExcessCm: 4, requiresStandingWater: false, guidance: 'Drain field 10–14 days before harvest for uniform grain ripening.' },
      harvest: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 2, requiresStandingWater: false, guidance: 'Field must be dry (0 cm standing water) for harvesting and lodging prevention.' },
    },
  },
  {
    id: 'wheat',
    name: 'Wheat',
    scientificName: 'Triticum aestivum',
    category: 'Cereal',
    regions: ['South Asia', 'Europe', 'North America', 'Central Asia', 'Global Temperate'],
    stages: ['land_preparation', 'sowing', 'germination', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [12, 26],
    heatStressTempC: 32,
    coldStressTempC: 2,
    heavyRain24hMm: 35,
    strongWindKmh: 40,
    drySpellDaysWarning: 10,
    waterNote: 'Wheat does not tolerate standing water. Any persistent standing water >1 cm causes root hypoxia and lodging.',
    stageWaterThresholds: {
      vegetative: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1.5, requiresStandingWater: false, guidance: 'Irrigate moist to field capacity at crown root initiation; drain any standing water immediately.' },
      flowering: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1, requiresStandingWater: false, guidance: 'Avoid waterlogging and overhead wetting during anthesis to limit Fusarium head blight.' },
      grain_fruit_formation: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1, requiresStandingWater: false, guidance: 'Zero standing water; heat >32°C accelerates premature grain shriveling.' },
    },
  },
  {
    id: 'maize',
    name: 'Maize (Corn)',
    scientificName: 'Zea mays',
    category: 'Cereal',
    regions: ['Global Tropical & Temperate', 'North America', 'South Asia', 'Sub-Saharan Africa'],
    stages: ['land_preparation', 'sowing', 'germination', 'seedling', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [18, 32],
    heatStressTempC: 35,
    coldStressTempC: 8,
    heavyRain24hMm: 40,
    strongWindKmh: 42,
    drySpellDaysWarning: 7,
    waterNote: 'Maize is highly sensitive to waterlogging during seedling and vegetative stages and to drought during tasseling/silking.',
    stageWaterThresholds: {
      seedling: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1, requiresStandingWater: false, guidance: 'Young maize seedlings cannot survive >24h of standing water.' },
      flowering: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1.5, requiresStandingWater: false, guidance: 'Critical pollination window: ensure moist rootzone with zero ponding.' },
    },
  },
  {
    id: 'ragi',
    name: 'Ragi (Finger Millet)',
    scientificName: 'Eleusine coracana',
    category: 'Millet',
    regions: ['South India', 'East Africa', 'Semi-Arid Tropics'],
    stages: ['land_preparation', 'sowing', 'germination', 'seedling', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [18, 33],
    heatStressTempC: 37,
    coldStressTempC: 10,
    heavyRain24hMm: 45,
    strongWindKmh: 45,
    drySpellDaysWarning: 12,
    waterNote: 'Drought-resilient rainfed millet; strictly intolerant of standing water or poorly drained clay ponding.',
    stageWaterThresholds: {
      vegetative: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1, requiresStandingWater: false, guidance: 'Drain excess rainwater immediately via furrow channels.' },
    },
  },
  {
    id: 'sugarcane',
    name: 'Sugarcane',
    scientificName: 'Saccharum officinarum',
    category: 'Cash Crop',
    regions: ['India', 'Brazil', 'Southeast Asia', 'Subtropical Basins'],
    stages: ['land_preparation', 'sowing', 'germination', 'vegetative', 'maturity', 'harvest'],
    optimalTempC: [20, 35],
    heatStressTempC: 40,
    coldStressTempC: 7,
    heavyRain24hMm: 60,
    strongWindKmh: 45,
    drySpellDaysWarning: 10,
    waterNote: 'High water demand in formative growth, but prolonged standing water (>5 cm) lowers sucrose accumulation and induces lodging in tall cane.',
    stageWaterThresholds: {
      germination: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1.5, requiresStandingWater: false, guidance: 'Prevent sett rot by keeping planting furrows drained.' },
      vegetative: { minStandingWaterCm: 0, maxStandingWaterCm: 1, criticalExcessCm: 5, requiresStandingWater: false, guidance: 'Deep ridge-furrow irrigation preferred; drain excess floodwater within 24–48 hours.' },
    },
  },
  {
    id: 'cotton',
    name: 'Cotton',
    scientificName: 'Gossypium hirsutum',
    category: 'Cash Crop',
    regions: ['India', 'United States', 'Central Asia', 'West Africa'],
    stages: ['land_preparation', 'sowing', 'germination', 'seedling', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [21, 35],
    heatStressTempC: 39,
    coldStressTempC: 12,
    heavyRain24hMm: 35,
    strongWindKmh: 40,
    drySpellDaysWarning: 12,
    waterNote: 'Standing water causes square shedding and wilt; heavy rain during boll opening degrades lint quality.',
    stageWaterThresholds: {
      flowering: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 1, requiresStandingWater: false, guidance: 'Avoid waterlogging during squaring and boll setting to prevent flower drop.' },
      maturity: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 0.5, requiresStandingWater: false, guidance: 'Dry weather needed during boll opening; protect open bolls from heavy rainfall.' },
    },
  },
  {
    id: 'groundnut',
    name: 'Groundnut (Peanut)',
    scientificName: 'Arachis hypogaea',
    category: 'Oilseed',
    regions: ['India', 'West Africa', 'United States', 'China'],
    stages: ['land_preparation', 'sowing', 'germination', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [22, 33],
    heatStressTempC: 37,
    coldStressTempC: 14,
    heavyRain24hMm: 35,
    strongWindKmh: 45,
    drySpellDaysWarning: 9,
    waterNote: 'Requires well-drained sandy loam for pegging and pod development; standing water triggers root rot and aflatoxin risk.',
    stageWaterThresholds: {
      grain_fruit_formation: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 0.5, requiresStandingWater: false, guidance: 'Pod development requires aerated soil; zero standing water allowed.' },
    },
  },
  {
    id: 'tomato',
    name: 'Tomato',
    scientificName: 'Solanum lycopersicum',
    category: 'Vegetable',
    regions: ['Global'],
    stages: ['land_preparation', 'sowing', 'seedling', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [18, 29],
    heatStressTempC: 34,
    coldStressTempC: 8,
    heavyRain24hMm: 25,
    strongWindKmh: 35,
    drySpellDaysWarning: 5,
    waterNote: 'Extremely sensitive to standing water (bacterial wilt) and high-humidity rain (late blight). High heat (>34°C) causes blossom drop.',
    stageWaterThresholds: {
      vegetative: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 0.5, requiresStandingWater: false, guidance: 'Raised beds recommended; any standing water invites fungal/bacterial root wilt.' },
      flowering: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 0.5, requiresStandingWater: false, guidance: 'Consistent drip moisture without wet foliage prevents blossom-end rot and blight.' },
    },
  },
  {
    id: 'potato',
    name: 'Potato',
    scientificName: 'Solanum tuberosum',
    category: 'Vegetable',
    regions: ['Global Temperate & Highland'],
    stages: ['land_preparation', 'sowing', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [14, 24],
    heatStressTempC: 30,
    coldStressTempC: 2,
    heavyRain24hMm: 30,
    strongWindKmh: 38,
    drySpellDaysWarning: 6,
    waterNote: 'Tubers rot rapidly under standing water. Cool humid rain raises late blight risk.',
    stageWaterThresholds: {
      grain_fruit_formation: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 0.5, requiresStandingWater: false, guidance: 'Keep ridges well drained during tuber bulking.' },
    },
  },
  {
    id: 'onion',
    name: 'Onion',
    scientificName: 'Allium cepa',
    category: 'Vegetable',
    regions: ['Global'],
    stages: ['land_preparation', 'sowing', 'seedling', 'vegetative', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [15, 28],
    heatStressTempC: 35,
    coldStressTempC: 5,
    heavyRain24hMm: 25,
    strongWindKmh: 38,
    drySpellDaysWarning: 6,
    waterNote: 'Shallow root system needs frequent light irrigation, but standing water at bulb maturity causes neck rot and purple blotch.',
    stageWaterThresholds: {
      maturity: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 0.5, requiresStandingWater: false, guidance: 'Stop irrigation 10–15 days prior to lifting bulbs; protect from rain.' },
    },
  },
  {
    id: 'pulses',
    name: 'Pulses (Chickpea / Lentil / Pigeon Pea)',
    scientificName: 'Fabaceae spp.',
    category: 'Pulse',
    regions: ['South Asia', 'East Africa', 'Mediterranean', 'Global'],
    stages: ['land_preparation', 'sowing', 'germination', 'vegetative', 'flowering', 'grain_fruit_formation', 'maturity', 'harvest'],
    optimalTempC: [16, 30],
    heatStressTempC: 35,
    coldStressTempC: 5,
    heavyRain24hMm: 30,
    strongWindKmh: 40,
    drySpellDaysWarning: 12,
    waterNote: 'Pulses fix atmospheric nitrogen and suffer severely from root hypoxia if standing water persists even briefly.',
    stageWaterThresholds: {
      flowering: { minStandingWaterCm: 0, maxStandingWaterCm: 0, criticalExcessCm: 0.5, requiresStandingWater: false, guidance: 'Ensure positive surface drainage; avoid over-irrigation during pod initiation.' },
    },
  },
];

export function getCropById(cropId: string): CropMetadata {
  const normalized = cropId.trim().toLowerCase();
  return CROP_DATABASE.find((c) => c.id === normalized) ?? CROP_DATABASE[0];
}

export function getStageWaterThreshold(cropId: string, stageId: GrowthStageId): StageWaterThreshold {
  const crop = getCropById(cropId);
  const specific = crop.stageWaterThresholds[stageId];
  if (specific) return specific;
  if (crop.id === 'rice' && stageId !== 'maturity' && stageId !== 'harvest') {
    return {
      minStandingWaterCm: 1,
      maxStandingWaterCm: 5,
      criticalExcessCm: 14,
      requiresStandingWater: true,
      guidance: 'Maintain shallow standing water (1–5 cm) or saturated field conditions.',
    };
  }
  return {
    minStandingWaterCm: 0,
    maxStandingWaterCm: 0,
    criticalExcessCm: 1.0,
    requiresStandingWater: false,
    guidance: `${crop.name} does not tolerate standing water. Maintain well-drained soil moisture without ponding.`,
  };
}
