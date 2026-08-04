// Server-only — nunca importar desde un componente "use client". Habla con
// Google Sheets usando las credenciales de un Service Account (env vars),
// nunca expuestas al browser. Misma spreadsheet que usa la app de Streamlit,
// pero en una tab separada (`clients_web`) para no pisar su esquema.
import { google, sheets_v4 } from "googleapis";

const WORKSHEET_NAME = "clients_web";
const HEADER = [
  "client_id", "client_name", "projection_id", "projection_name",
  "config_json", "entries_json", "updated_at",
];

export interface ClientRow {
  clientId: string;
  clientName: string;
  projectionId: string;
  projectionName: string;
  configJson: string;
  entriesJson: string;
  updatedAt: string;
}

function getCreds(): { email: string; key: string; sheetId: string } | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!email || !rawKey || !sheetId) return null;
  // En Vercel las env vars no soportan saltos de línea reales — se cargan con "\n" literal.
  return { email, key: rawKey.replace(/\\n/g, "\n"), sheetId };
}

export function sheetsConfigured(): boolean {
  return getCreds() !== null;
}

async function getClient(): Promise<{ sheets: sheets_v4.Sheets; spreadsheetId: string }> {
  const creds = getCreds();
  if (!creds) throw new Error("Google Sheets no está configurado (faltan env vars).");
  const auth = new google.auth.JWT({
    email: creds.email,
    key: creds.key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, spreadsheetId: creds.sheetId };
}

async function ensureWorksheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === WORKSHEET_NAME);
  if (existing?.properties?.sheetId != null) return existing.properties.sheetId;

  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: WORKSHEET_NAME } } }] },
  });
  const newSheetId = created.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (newSheetId == null) throw new Error("No se pudo crear la tab clients_web.");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${WORKSHEET_NAME}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADER] },
  });
  return newSheetId;
}

function rowToClientRow(r: string[]): ClientRow {
  return {
    clientId: r[0] ?? "",
    clientName: r[1] ?? "",
    projectionId: r[2] ?? "",
    projectionName: r[3] ?? "",
    configJson: r[4] ?? "{}",
    entriesJson: r[5] ?? "{}",
    updatedAt: r[6] ?? "",
  };
}

export async function listRows(): Promise<ClientRow[]> {
  const { sheets, spreadsheetId } = await getClient();
  await ensureWorksheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${WORKSHEET_NAME}!A2:G`,
  });
  const rows = res.data.values ?? [];
  return rows.filter((r) => r[0]).map(rowToClientRow);
}

export async function upsertRow(row: ClientRow): Promise<void> {
  const { sheets, spreadsheetId } = await getClient();
  await ensureWorksheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${WORKSHEET_NAME}!A2:G`,
  });
  const rows = res.data.values ?? [];
  const idx = rows.findIndex((r) => r[0] === row.clientId && r[2] === row.projectionId);
  const values = [[
    row.clientId, row.clientName, row.projectionId, row.projectionName,
    row.configJson, row.entriesJson, row.updatedAt,
  ]];

  if (idx === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${WORKSHEET_NAME}!A:G`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
  } else {
    const rowNum = idx + 2; // fila 1 = header, arrays 0-indexados
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${WORKSHEET_NAME}!A${rowNum}:G${rowNum}`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }
}

/** Borra todas las filas de un cliente, o solo una proyección puntual si se pasa projectionId. */
export async function deleteRows(clientId: string, projectionId?: string): Promise<void> {
  const { sheets, spreadsheetId } = await getClient();
  const numericSheetId = await ensureWorksheet(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${WORKSHEET_NAME}!A2:G`,
  });
  const rows = res.data.values ?? [];
  const rowNumsToDelete: number[] = [];
  rows.forEach((r, i) => {
    if (r[0] === clientId && (projectionId === undefined || r[2] === projectionId)) {
      rowNumsToDelete.push(i + 2);
    }
  });
  if (rowNumsToDelete.length === 0) return;

  // De abajo hacia arriba para que borrar una fila no corra el índice de las siguientes.
  const requests = rowNumsToDelete
    .sort((a, b) => b - a)
    .map((rowNum) => ({
      deleteDimension: {
        range: { sheetId: numericSheetId, dimension: "ROWS", startIndex: rowNum - 1, endIndex: rowNum },
      },
    }));
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}
