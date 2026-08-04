import { AutoWeightMeta, DailyMetric, MonthCurve, Weights7 } from "./types";

export type BlendResult =
  | { ok: true; weights: Weights7; monthCurve: MonthCurve; meta: AutoWeightMeta }
  | { ok: false; error: string };

const SEASONAL_WEIGHT = 0.7;
const RECENT_WEIGHT = 0.3;
const RECENT_WINDOW_DAYS = 45;

function jsDayToIdx(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function stageOfDay(dayOfMonth: number): 0 | 1 | 2 {
  if (dayOfMonth <= 10) return 0;
  if (dayOfMonth <= 20) return 1;
  return 2;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function weekdayFactors(rows: DailyMetric[]): [number, number, number, number, number, number, number] | null {
  if (rows.length === 0) return null;
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const r of rows) {
    const idx = jsDayToIdx(parseDateStr(r.date).getDay());
    sums[idx] += r.revenue;
    counts[idx] += 1;
    total += r.revenue;
  }
  const overallMean = total / rows.length;
  if (!overallMean) return null;
  return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] / overallMean : 1)) as [
    number, number, number, number, number, number, number,
  ];
}

function stageFactors(rows: DailyMetric[]): [number, number, number] | null {
  if (rows.length === 0) return null;
  const sums = [0, 0, 0];
  const counts = [0, 0, 0];
  let total = 0;
  for (const r of rows) {
    const stage = stageOfDay(parseDateStr(r.date).getDate());
    sums[stage] += r.revenue;
    counts[stage] += 1;
    total += r.revenue;
  }
  const overallMean = total / rows.length;
  if (!overallMean) return null;
  return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] / overallMean : 1)) as [number, number, number];
}

function blend7(
  est: [number, number, number, number, number, number, number] | null,
  rec: [number, number, number, number, number, number, number] | null
): [number, number, number, number, number, number, number] {
  if (!est && !rec) return [1, 1, 1, 1, 1, 1, 1];
  if (!est) return rec!;
  if (!rec) return est;
  return est.map((v, i) => SEASONAL_WEIGHT * v + RECENT_WEIGHT * rec[i]) as [
    number, number, number, number, number, number, number,
  ];
}

function blend3(
  est: [number, number, number] | null,
  rec: [number, number, number] | null
): [number, number, number] {
  if (!est && !rec) return [1, 1, 1];
  if (!est) return rec!;
  if (!rec) return est;
  return est.map((v, i) => SEASONAL_WEIGHT * v + RECENT_WEIGHT * rec[i]) as [number, number, number];
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Blend estacional (mismo mes año pasado, 70%) + reciente (últimos 45 días, 30%),
 * cada ventana descompuesta en día-de-semana × etapa-del-mes — mismo criterio que
 * el motor de Streamlit. Ventanas sin datos degradan con gracia a 100% la otra
 * ventana en vez de fallar. `targetMonth` es 0-11 (convención de AppConfig).
 */
export function computeBlendWeights(
  dailyMetrics: DailyMetric[],
  targetYear: number,
  targetMonth: number
): BlendResult {
  if (dailyMetrics.length === 0) {
    return { ok: false, error: "No hay datos de ventas cargados." };
  }

  const sorted = [...dailyMetrics].sort((a, b) => (a.date < b.date ? -1 : 1));
  const dateFrom = sorted[0].date;
  const dateTo = sorted[sorted.length - 1].date;
  const dFrom = parseDateStr(dateFrom);
  const dTo = parseDateStr(dateTo);
  const monthCount =
    (dTo.getFullYear() - dFrom.getFullYear()) * 12 + (dTo.getMonth() - dFrom.getMonth()) + 1;

  const seasonalStart = toDateStr(new Date(targetYear - 1, targetMonth, 1));
  const seasonalEnd = toDateStr(new Date(targetYear - 1, targetMonth + 1, 0));
  const seasonalWindow = sorted.filter((r) => r.date >= seasonalStart && r.date <= seasonalEnd);

  const maxDate = parseDateStr(dateTo);
  const recentStart = new Date(maxDate);
  recentStart.setDate(recentStart.getDate() - (RECENT_WINDOW_DAYS - 1));
  const recentStartStr = toDateStr(recentStart);
  const recentWindow = sorted.filter((r) => r.date >= recentStartStr && r.date <= dateTo);

  const dowEst = weekdayFactors(seasonalWindow);
  const dowRec = weekdayFactors(recentWindow);
  const stageEst = stageFactors(seasonalWindow);
  const stageRec = stageFactors(recentWindow);

  const dowBlend = blend7(dowEst, dowRec);
  const stageBlend = blend3(stageEst, stageRec);

  const weights = dowBlend.map((v) => Math.round(v * 100) / 100) as Weights7;
  const monthCurve: MonthCurve = {
    early: Math.round(stageBlend[0] * 100) / 100,
    mid: Math.round(stageBlend[1] * 100) / 100,
    late: Math.round(stageBlend[2] * 100) / 100,
  };

  return {
    ok: true,
    weights,
    monthCurve,
    meta: {
      rowCount: sorted.length,
      monthCount,
      dateFrom,
      dateTo,
      source: "tiendanube",
      seasonalDays: seasonalWindow.length,
      recentDays: recentWindow.length,
    },
  };
}
