export function formatTemp(tempC: number | null | undefined, unit: 'C' | 'F' = 'C'): string {
  if (tempC === null || tempC === undefined || !Number.isFinite(tempC)) return '--';
  if (unit === 'F') {
    return `${((tempC * 9) / 5 + 32).toFixed(1)}°F`;
  }
  return `${tempC.toFixed(1)}°C`;
}

export function convertTempValue(tempC: number | null | undefined, unit: 'C' | 'F' = 'C'): number | null {
  if (tempC === null || tempC === undefined || !Number.isFinite(tempC)) return null;
  return unit === 'F' ? Number(((tempC * 9) / 5 + 32).toFixed(1)) : Number(tempC.toFixed(1));
}

export function formatRain(mm: number | null | undefined, unit: 'mm' | 'cm' | 'in' = 'mm'): string {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return '--';
  if (unit === 'cm') return `${(mm / 10).toFixed(2)} cm`;
  if (unit === 'in') return `${(mm / 25.4).toFixed(2)} in`;
  return `${mm.toFixed(1)} mm`;
}

export function formatDepthFromCm(cm: number | null | undefined, unit: 'cm' | 'mm' | 'in' = 'cm'): string {
  if (cm === null || cm === undefined || !Number.isFinite(cm)) return '--';
  if (unit === 'mm') return `${(cm * 10).toFixed(0)} mm`;
  if (unit === 'in') return `${(cm / 2.54).toFixed(2)} in`;
  return `${cm.toFixed(1)} cm`;
}

export function formatWind(kmh: number | null | undefined, unit: 'kmh' | 'mph' | 'ms' = 'kmh'): string {
  if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return '--';
  if (unit === 'mph') return `${(kmh * 0.621371).toFixed(1)} mph`;
  if (unit === 'ms') return `${(kmh / 3.6).toFixed(1)} m/s`;
  return `${kmh.toFixed(1)} km/h`;
}

export function windCompassDirection(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) return '--';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${dirs[Math.round(deg / 45) % 8]} (${Math.round(deg)}°)`;
}

export function formatLocalTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '--';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timeZone && timeZone !== 'auto' ? timeZone : undefined,
    }).format(dt);
  } catch {
    return iso.slice(11, 16) || iso;
  }
}

export function formatShortDate(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(dt);
  } catch {
    return iso;
  }
}
