import { AppConfig, ComputedDay, DayEntry, SpecialEvent } from "./types";

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function jsDayToIdx(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function eventsForDate(dateStr: string, events: SpecialEvent[]): SpecialEvent[] {
  return events.filter((e) => e.date === dateStr);
}

function curveMultiplier(dayOfMonth: number, config: AppConfig): number {
  if (dayOfMonth <= 10) return config.monthCurve.early;
  if (dayOfMonth <= 20) return config.monthCurve.mid;
  return config.monthCurve.late;
}

function effectiveWeight(
  jsDay: number,
  dateStr: string,
  dayOfMonth: number,
  config: AppConfig,
  entries: Record<string, DayEntry>
): number {
  // Manual table override wins over everything
  const override = entries[dateStr]?.weightOverride;
  if (override != null) return override;

  // Base = dayOfWeek × curveMult
  const base =
    config.dayWeights[jsDayToIdx(jsDay)] * curveMultiplier(dayOfMonth, config);

  // Sum all special event weights for this date (always additive)
  const dayEvents = eventsForDate(dateStr, config.specialEvents);
  const eventSum = dayEvents.reduce((s, e) => s + e.weight, 0);

  return base + eventSum;
}

export function computeDays(
  config: AppConfig,
  entries: Record<string, DayEntry>
): ComputedDay[] {
  const { year, month, targetRevenue, targetMER, guideAOV, guideCR } = config;
  const targetSpendTotal = targetMER > 0 ? targetRevenue / targetMER : 0;
  const crRatio = guideCR > 0 ? guideCR / 100 : 0;
  const todayStr = toDateStr(new Date());

  const days = getDaysInMonth(year, month);

  const weights = days.map((d) =>
    effectiveWeight(d.getDay(), toDateStr(d), d.getDate(), config, entries)
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  return days.map((d, i) => {
    const dateStr = toDateStr(d);
    const w = weights[i];
    const share = totalWeight > 0 ? w / totalWeight : 0;
    const tRev = targetRevenue * share;
    const tSpend = targetSpendTotal * share;
    const tSessions = guideAOV > 0 && crRatio > 0 ? tRev / guideAOV / crRatio : null;

    const entry = entries[dateStr];
    const rRev = entry?.realityRevenue ?? null;
    const rSpend = entry?.realitySpend ?? null;
    const rSessions = entry?.realitySessions ?? null;
    const rOrders = entry?.realityOrders ?? null;

    const dayEvents = eventsForDate(dateStr, config.specialEvents);
    const eventBadges = dayEvents.map((e) => e.label).filter(Boolean);
    const eventLabel = eventBadges.join(" + "); // kept for CSV

    return {
      date: dateStr,
      dayOfWeek: DAY_NAMES[jsDayToIdx(d.getDay())],
      eventLabel,
      eventBadges,
      weight: w,
      targetRevenue: tRev,
      targetSpend: tSpend,
      targetSessions: tSessions,
      realityRevenue: rRev,
      realitySpend: rSpend,
      realitySessions: rSessions,
      realityOrders: rOrders,
      pacingRevenue: rRev != null && tRev > 0 ? rRev / tRev : null,
      pacingSpend: rSpend != null && tSpend > 0 ? rSpend / tSpend : null,
      realMER: rRev != null && rSpend != null && rSpend > 0 ? rRev / rSpend : null,
      realCR:
        rSessions != null && rOrders != null && rSessions > 0
          ? (rOrders / rSessions) * 100
          : null,
      realAOV:
        rOrders != null && rRev != null && rOrders > 0 ? rRev / rOrders : null,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    };
  });
}

export interface TotalsRow {
  totalTargetRevenue: number;
  totalTargetSpend: number;
  totalRealityRevenue: number;
  totalRealitySpend: number;
  totalRealitySessions: number;
  totalRealityOrders: number;
  pacingRevenue: number | null;
  pacingSpend: number | null;
  realMER: number | null;
  realCR: number | null;
  realAOV: number | null;
}

export function computeTotals(days: ComputedDay[], todayStr: string): TotalsRow {
  let totalTargetRev = 0, totalTargetSpend = 0;
  let totalRealRev = 0, totalRealSpend = 0;
  let totalRealSessions = 0, totalRealOrders = 0;
  let targetRevToDate = 0, targetSpendToDate = 0;
  let realRevToDate = 0, realSpendToDate = 0;

  for (const d of days) {
    totalTargetRev += d.targetRevenue;
    totalTargetSpend += d.targetSpend;
    totalRealRev += d.realityRevenue ?? 0;
    totalRealSpend += d.realitySpend ?? 0;
    totalRealSessions += d.realitySessions ?? 0;
    totalRealOrders += d.realityOrders ?? 0;

    if (d.date <= todayStr) {
      targetRevToDate += d.targetRevenue;
      targetSpendToDate += d.targetSpend;
      realRevToDate += d.realityRevenue ?? 0;
      realSpendToDate += d.realitySpend ?? 0;
    }
  }

  return {
    totalTargetRevenue: totalTargetRev,
    totalTargetSpend: totalTargetSpend,
    totalRealityRevenue: totalRealRev,
    totalRealitySpend: totalRealSpend,
    totalRealitySessions: totalRealSessions,
    totalRealityOrders: totalRealOrders,
    pacingRevenue: targetRevToDate > 0 ? realRevToDate / targetRevToDate : null,
    pacingSpend: targetSpendToDate > 0 ? realSpendToDate / targetSpendToDate : null,
    realMER: totalRealSpend > 0 ? totalRealRev / totalRealSpend : null,
    realCR: totalRealSessions > 0 ? (totalRealOrders / totalRealSessions) * 100 : null,
    realAOV: totalRealOrders > 0 ? totalRealRev / totalRealOrders : null,
  };
}

export function exportToCSV(days: ComputedDay[]): string {
  const headers = [
    "Fecha", "Día", "Evento", "Peso",
    "Target Revenue", "Reality Revenue", "% Pacing Revenue",
    "Target Sesiones", "Reality Sesiones", "Reality Pedidos", "CR Real", "AOV Real",
    "Target Spend", "Reality Spend", "% Pacing Spend", "MER Real",
  ];
  const rows = days.map((d) => [
    d.date, d.dayOfWeek, `"${d.eventLabel}"`, d.weight.toFixed(2),
    d.targetRevenue.toFixed(2),
    d.realityRevenue?.toFixed(2) ?? "",
    d.pacingRevenue != null ? (d.pacingRevenue * 100).toFixed(1) + "%" : "",
    d.targetSessions?.toFixed(0) ?? "",
    d.realitySessions?.toFixed(0) ?? "",
    d.realityOrders?.toFixed(0) ?? "",
    d.realCR != null ? d.realCR.toFixed(2) + "%" : "0%",
    d.realAOV != null ? "$" + d.realAOV.toFixed(2) : "$0",
    d.targetSpend.toFixed(2),
    d.realitySpend?.toFixed(2) ?? "",
    d.pacingSpend != null ? (d.pacingSpend * 100).toFixed(1) + "%" : "",
    d.realMER?.toFixed(2) ?? "",
  ]);
  return [headers, ...rows].map((r) => r.join(",")).join("\n");
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
