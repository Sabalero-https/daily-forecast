import { AppConfig, ComputedDay } from "./types";

// Pestaña "Objetivos" del spreadsheet de cada cliente: una fila por día con lo que planeamos.
// El Daily Forecast del cliente la lee por fecha (BUSCARX), igual que lee "Datos diarios" para la realidad.
export const OBJETIVOS_HOJA = "Objetivos";

export const OBJETIVOS_HEADER = [
  "Fecha",
  "Facturación objetivo",
  "Inversión objetivo",
  "MER objetivo",
  "Sesiones objetivo",
  "Sesiones de pauta objetivo",
  "Pedidos objetivo",
  "CR objetivo",
  "Ticket objetivo",
  "Evento",
] as const;

// Una fila por día. Los números van sin redondear ni formatear: el formato lo pone la hoja.
// Lo que no se puede calcular (por ejemplo, sin ticket guía no hay pedidos objetivo) queda en null.
export type ObjetivoFila = [
  string,          // Fecha AAAA-MM-DD
  number,          // Facturación objetivo
  number,          // Inversión objetivo
  number | null,   // MER objetivo
  number | null,   // Sesiones objetivo
  number | null,   // Sesiones de pauta objetivo
  number | null,   // Pedidos objetivo
  number | null,   // CR objetivo (fracción: 0,02 = 2%)
  number | null,   // Ticket objetivo
  string,          // Evento
];

export function buildObjetivos(days: ComputedDay[], config: AppConfig): ObjetivoFila[] {
  const cr = config.guideCR > 0 ? config.guideCR / 100 : null;
  const ticket = config.guideAOV > 0 ? config.guideAOV : null;
  const pauta = config.guidePaidShare > 0 ? config.guidePaidShare / 100 : null;
  return days.map((d) => [
    d.date,
    d.targetRevenue,
    d.targetSpend,
    d.targetSpend > 0 ? d.targetRevenue / d.targetSpend : null,
    d.targetSessions,
    d.targetSessions != null && pauta != null ? d.targetSessions * pauta : null,
    ticket != null ? d.targetRevenue / ticket : null,
    cr,
    ticket,
    d.eventLabel,
  ]);
}

// CSV para importar a mano en la pestaña Objetivos (Archivo → Importar), si no se usa el botón.
// Separador coma y punto decimal; los textos van entre comillas.
export function objetivosToCSV(rows: ObjetivoFila[]): string {
  const celda = (v: string | number | null) =>
    v == null ? "" : typeof v === "number" ? String(Math.round(v * 10000) / 10000) : `"${v.replace(/"/g, '""')}"`;
  return [OBJETIVOS_HEADER.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.map(celda).join(","))].join("\n");
}

// Saca el ID de una URL de Google Sheets (o lo devuelve tal cual si ya es un ID).
export function spreadsheetIdFromUrl(urlOrId: string): string | null {
  const texto = urlOrId.trim();
  const match = texto.match(/\/spreadsheets\/d\/([\w-]+)/);
  if (match) return match[1];
  return /^[\w-]{20,}$/.test(texto) ? texto : null;
}

/** Fecha de la hoja (número de serie de Sheets o texto AAAA-MM-DD) a "AAAA-MM-DD". */
export function fechaISO(valor: unknown): string | null {
  if (typeof valor === "number") {
    // Sheets cuenta días desde el 30/12/1899.
    return new Date(Math.round((valor - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const texto = String(valor ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

/**
 * Junta lo que ya hay en la pestaña con los días nuevos: reemplaza los días entre la primera y la
 * última fecha nuevas y conserva el resto, ordenado por fecha. Las celdas vacías van como "".
 */
export function combinarObjetivos(anteriores: unknown[][], filas: ObjetivoFila[]): (string | number)[][] {
  const columnas = OBJETIVOS_HEADER.length;
  const fechas = filas.map((f) => f[0]).sort();
  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];
  const conservadas = anteriores
    .map((f) => [fechaISO(f[0]), ...f.slice(1, columnas)] as unknown[])
    .filter((f) => f[0] && ((f[0] as string) < desde || (f[0] as string) > hasta));
  return conservadas
    .concat(filas.map((f) => f.map((v) => (v == null ? "" : v))))
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map((f) => Array.from({ length: columnas }, (_, i) => (f[i] ?? "") as string | number));
}
