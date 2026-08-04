import { DailyMetric } from "./types";

// Estados de pago que normalmente NO representan facturación cobrada.
const PAID_STATUS_BLACKLIST = new Set([
  "rechazado", "vencido", "pendiente", "cancelado", "cancelada",
  "anulado", "anulada", "reembolsado", "parcialmente reembolsado",
]);

export interface TiendanubeParseResult {
  ok: true;
  metrics: DailyMetric[]; // ordenado por fecha, un elemento por día con ventas
  paymentStatuses: string[]; // valores distintos de "Estado del pago" encontrados
  defaultPaidStatuses: string[]; // sugerencia de default (todo menos el blacklist)
  rowCount: number;
}
export interface TiendanubeParseError {
  ok: false;
  error: string;
}

function decodeBuffer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Exports de Tiendanube en Windows suelen venir en Latin-1/Windows-1252.
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function detectSep(line: string): string {
  if (line.includes("\t")) return "\t";
  const semis = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

// Split de una línea CSV respetando comillas dobles (con "" como escape).
function splitCSVLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseFecha(s: string): string | null {
  // "DD/MM/YYYY H:MM:SS" (hora sin cero a la izquierda es válida)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d), month = Number(mo), year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAmount(raw: string): number | null {
  let v = raw.replace(/[^\d,.\-]/g, "").trim();
  if (!v) return null;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    v = lastComma > lastDot ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  } else if (lastComma !== -1) {
    v = v.replace(",", ".");
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function findCol(headers: string[], name: string): number {
  const norm = (s: string) => s.trim().toLowerCase();
  return headers.findIndex((h) => norm(h) === norm(name));
}

interface ParsedRow {
  fecha: string | null;
  total: number | null;
  orderNum: string;
  estadoPago: string;
}

function parseOneFile(text: string): { rows: ParsedRow[]; headers: string[] } | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const sep = detectSep(lines[0]);
  const headers = splitCSVLine(lines[0], sep);

  const fechaCol = findCol(headers, "Fecha");
  const totalCol = findCol(headers, "Total");
  if (fechaCol === -1 || totalCol === -1) return null;

  const orderCol = findCol(headers, "Número de orden");
  const statusCol = findCol(headers, "Estado del pago");

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], sep);
    const fecha = parseFecha(cols[fechaCol] ?? "");
    const total = parseAmount(cols[totalCol] ?? "");
    rows.push({
      fecha,
      total,
      orderNum: orderCol !== -1 ? (cols[orderCol] ?? "") : "",
      estadoPago: statusCol !== -1 ? (cols[statusCol] ?? "") : "",
    });
  }
  return { rows, headers };
}

/** true si el CSV parece un export de Tiendanube (trae al menos Fecha + Total). */
export function looksLikeTiendanube(text: string): boolean {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const sep = detectSep(firstLine);
  const headers = splitCSVLine(firstLine, sep);
  return findCol(headers, "Fecha") !== -1 && findCol(headers, "Total") !== -1;
}

/**
 * Parsea uno o más exports de Tiendanube y arma la serie diaria de revenue+pedidos.
 * Solo la primera fila de cada orden trae Fecha/Total (las filas de productos
 * adicionales de la misma orden vienen con ambos vacíos) — filtrarlas alcanza
 * para no duplicar montos. Dedup global por "Número de orden" entre archivos,
 * para poder subir el histórico completo + una exportación nueva sin duplicar
 * pedidos que se solapen.
 */
export async function parseTiendanubeFiles(
  files: File[],
  paidStatuses?: Set<string>
): Promise<TiendanubeParseResult | TiendanubeParseError> {
  const allRows: ParsedRow[] = [];
  const statusSet = new Set<string>();

  for (const file of files) {
    const buf = await file.arrayBuffer();
    const text = decodeBuffer(buf);
    const parsed = parseOneFile(text);
    if (!parsed) {
      return { ok: false, error: `"${file.name}" no tiene las columnas 'Fecha' y 'Total' de un export de Tiendanube.` };
    }
    allRows.push(...parsed.rows);
  }

  const seenOrders = new Set<string>();
  const dailyRevenue: Record<string, number> = {};
  const dailyPedidos: Record<string, number> = {};
  let rowCount = 0;

  for (const row of allRows) {
    if (!row.fecha || row.total === null) continue; // fila de producto adicional
    if (row.estadoPago) statusSet.add(row.estadoPago);
    if (paidStatuses && row.estadoPago && !paidStatuses.has(row.estadoPago)) continue;
    if (row.orderNum) {
      if (seenOrders.has(row.orderNum)) continue;
      seenOrders.add(row.orderNum);
    }
    dailyRevenue[row.fecha] = (dailyRevenue[row.fecha] ?? 0) + row.total;
    dailyPedidos[row.fecha] = (dailyPedidos[row.fecha] ?? 0) + 1;
    rowCount++;
  }

  const dates = Object.keys(dailyRevenue).sort();
  const metrics: DailyMetric[] = dates.map((date) => ({
    date,
    revenue: dailyRevenue[date],
    pedidos: dailyPedidos[date],
  }));

  const paymentStatuses = Array.from(statusSet).sort();
  const defaultPaidStatuses = paymentStatuses.filter((s) => !PAID_STATUS_BLACKLIST.has(s.trim().toLowerCase()));

  if (metrics.length === 0) {
    return { ok: false, error: "No quedaron filas después de la limpieza. Revisá el archivo o los estados de pago." };
  }

  return { ok: true, metrics, paymentStatuses, defaultPaidStatuses, rowCount };
}
