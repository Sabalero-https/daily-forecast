import { AutoWeightMeta, MonthCurve } from "./types";

type Weights7 = [number, number, number, number, number, number, number];

export type AutoWeightResult =
  | { ok: true; weights: Weights7; monthCurve: MonthCurve; meta: AutoWeightMeta }
  | { ok: false; error: string };

function jsDayToIdx(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmyDash) return new Date(Number(dmyDash[3]), Number(dmyDash[2]) - 1, Number(dmyDash[1]));
  return null;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseAmount(s: string): number | null {
  let v = s.replace(/[$€\s%]/g, "").trim();
  if (!v) return null;
  // "1.234,56" (AR thousands + decimal)
  if (/^\d{1,3}(\.\d{3})+,\d*$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  // "1,234.56" (US thousands + decimal)
  else if (/^\d{1,3}(,\d{3})+\.?\d*$/.test(v)) v = v.replace(/,/g, "");
  // "1234,56" (AR no-thousands decimal)
  else if (/^\d+,\d+$/.test(v)) v = v.replace(",", ".");
  // "1.234" (AR thousands, integer)
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? null : n;
}

function detectSep(line: string): string {
  if (line.includes("\t")) return "\t";
  const semis = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

const DATE_KW   = ["fecha", "date", "día", "dia", "day", "created_at", "order_date", "fecha_venta", "fecha_pedido", "fecha_orden"];
const AMOUNT_KW = ["monto", "total", "revenue", "importe", "amount", "venta", "facturación", "facturacion", "precio", "price", "subtotal", "net", "gmv", "valor"];

export function parseAndComputeWeights(csvText: string): AutoWeightResult {
  const lines = csvText.trim().split(/\r?\n/).filter((s) => s.trim());
  if (lines.length < 2) return { ok: false, error: "El archivo está vacío o no tiene datos." };

  const sep     = detectSep(lines[0]);
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  let dateCol   = headers.findIndex((h) => DATE_KW.some((k) => h.includes(k)));
  let amountCol = headers.findIndex((h) => AMOUNT_KW.some((k) => h.includes(k)));

  // Auto-detect by content if keyword match failed
  if (dateCol === -1 || amountCol === -1) {
    const sample = lines.slice(1, Math.min(6, lines.length));
    for (let col = 0; col < headers.length; col++) {
      const vals = sample.map((row) => row.split(sep)[col]?.trim().replace(/['"]/g, "") ?? "");
      if (dateCol === -1 && vals.every((v) => parseDate(v) !== null)) {
        dateCol = col;
      } else if (amountCol === -1 && col !== dateCol && vals.every((v) => parseAmount(v) !== null)) {
        amountCol = col;
      }
    }
  }

  if (dateCol === -1)   return { ok: false, error: "No se encontró columna de fecha. Usá un header como 'fecha' o 'date'." };
  if (amountCol === -1) return { ok: false, error: "No se encontró columna de monto. Usá un header como 'monto', 'total' o 'amount'." };

  const dailyRevenue: Record<string, number> = {};
  let rowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols   = lines[i].split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const date   = parseDate(cols[dateCol] ?? "");
    const amount = parseAmount(cols[amountCol] ?? "");
    if (!date || amount === null) continue;
    const key = toDateStr(date);
    dailyRevenue[key] = (dailyRevenue[key] ?? 0) + amount;
    rowCount++;
  }

  if (rowCount < 10) return { ok: false, error: `Solo se parsearon ${rowCount} filas válidas. Revisá el formato del archivo.` };

  const dates    = Object.keys(dailyRevenue).sort();
  const dateFrom = dates[0];
  const dateTo   = dates[dates.length - 1];

  const dFrom = parseDate(dateFrom)!;
  const dTo   = parseDate(dateTo)!;

  const monthSpan =
    (dTo.getFullYear() - dFrom.getFullYear()) * 12 +
    (dTo.getMonth() - dFrom.getMonth()) + 1;

  if (monthSpan < 3) {
    return {
      ok: false,
      error: `Se necesitan al menos 3 meses de historial. Tus datos cubren ${monthSpan} mes${monthSpan > 1 ? "es" : ""} (${dateFrom} → ${dateTo}).`,
    };
  }

  // Walk every calendar day once — compute both day-of-week and month-period avgs
  const dowRevSum    = [0, 0, 0, 0, 0, 0, 0]; // Mon…Sun
  const dowCounts    = [0, 0, 0, 0, 0, 0, 0];
  const periodRevSum = [0, 0, 0];              // early / mid / late
  const periodCounts = [0, 0, 0];

  const cursor = new Date(dFrom);
  while (cursor <= dTo) {
    const rev = dailyRevenue[toDateStr(cursor)] ?? 0;
    const dow = jsDayToIdx(cursor.getDay());
    dowRevSum[dow]    += rev;
    dowCounts[dow]    += 1;
    const dom         = cursor.getDate();
    const p           = dom <= 10 ? 0 : dom <= 20 ? 1 : 2;
    periodRevSum[p]   += rev;
    periodCounts[p]   += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  // Day-of-week weights
  const dowAvgs = dowRevSum.map((s, i) => (dowCounts[i] > 0 ? s / dowCounts[i] : 0));
  const dowMean = dowAvgs.reduce((a, b) => a + b, 0) / 7;
  if (dowMean === 0) return { ok: false, error: "Los montos son todos cero; no se pueden calcular pesos." };
  const weights = dowAvgs.map((a) => Math.round((a / dowMean) * 100) / 100) as Weights7;

  // Month-curve multipliers (early / mid / late)
  const pAvgs    = periodRevSum.map((s, i) => (periodCounts[i] > 0 ? s / periodCounts[i] : 0));
  const pMean    = pAvgs.reduce((a, b) => a + b, 0) / 3;
  const round2   = (n: number) => Math.round(n * 100) / 100;
  const monthCurve: MonthCurve = pMean > 0
    ? { early: round2(pAvgs[0] / pMean), mid: round2(pAvgs[1] / pMean), late: round2(pAvgs[2] / pMean) }
    : { early: 1, mid: 1, late: 1 };

  return { ok: true, weights, monthCurve, meta: { rowCount, monthCount: monthSpan, dateFrom, dateTo } };
}
