// Server-only: nunca importar desde un componente "use client".
// Escribe la pestaña "Objetivos" en el spreadsheet de un cliente con una cuenta de servicio de Google
// (credenciales en variables de entorno, nunca en el navegador).
//
// Reemplaza solo los días del mes que se manda y conserva los demás meses, así cada proyección
// se puede volver a mandar cuantas veces haga falta sin pisar el histórico.
import { google, sheets_v4 } from "googleapis";
import { OBJETIVOS_HEADER, OBJETIVOS_HOJA, ObjetivoFila, combinarObjetivos } from "../objetivos";

const COLUMNAS = OBJETIVOS_HEADER.length;
const ULTIMA_COL = String.fromCharCode(64 + COLUMNAS); // J

export function cuentaDeServicio(): string | null {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
}

function cliente(): sheets_v4.Sheets {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const clave = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !clave) {
    throw new ErrorObjetivos("La app no tiene configurada la cuenta de servicio de Google (faltan variables de entorno).", 500);
  }
  const auth = new google.auth.JWT({
    email,
    // En Vercel las variables no admiten saltos de línea reales: la clave se carga con "\n" literales.
    key: clave.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export class ErrorObjetivos extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function traducirError(e: unknown): ErrorObjetivos {
  if (e instanceof ErrorObjetivos) return e;
  const codigo = (e as { code?: number; status?: number })?.code ?? (e as { status?: number })?.status;
  if (codigo === 403) {
    return new ErrorObjetivos(
      `La cuenta de servicio no tiene permiso sobre ese spreadsheet. Compartilo con ${cuentaDeServicio()} como Editor.`, 403);
  }
  if (codigo === 404) return new ErrorObjetivos("No se encontró el spreadsheet. Revisá la URL.", 404);
  return new ErrorObjetivos(`Google Sheets respondió con un error: ${(e as Error)?.message ?? e}`, 502);
}

export async function escribirObjetivos(spreadsheetId: string, filas: ObjetivoFila[]): Promise<{ hoja: string; filas: number }> {
  if (!filas.length) throw new ErrorObjetivos("No hay días para mandar.", 400);
  const sheets = cliente();
  try {
    // 1. La pestaña existe o se crea con el encabezado.
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
    let hoja = meta.data.sheets?.find((s) => s.properties?.title === OBJETIVOS_HOJA)?.properties;
    if (!hoja) {
      const creada = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: OBJETIVOS_HOJA } } }] },
      });
      hoja = creada.data.replies?.[0]?.addSheet?.properties ?? undefined;
      if (hoja?.sheetId == null) throw new ErrorObjetivos("No se pudo crear la pestaña Objetivos.", 502);
    }
    const sheetId = hoja.sheetId!;

    // 2. Lo que ya hay: se conservan los días fuera del rango que se manda.
    const leido = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${OBJETIVOS_HOJA}!A2:${ULTIMA_COL}`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });
    const anteriores = (leido.data.values ?? []) as unknown[][];
    const todas = combinarObjetivos(anteriores, filas);

    // 3. Se escribe encima y después se borra el sobrante, para que la hoja nunca quede vacía.
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${OBJETIVOS_HOJA}!A1`,
      // USER_ENTERED para que "AAAA-MM-DD" quede como fecha (el forecast busca por fecha).
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...OBJETIVOS_HEADER], ...todas] },
    });
    if (anteriores.length > todas.length) {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${OBJETIVOS_HOJA}!A${todas.length + 2}:${ULTIMA_COL}${anteriores.length + 1}`,
      });
    }

    // 4. Formatos y encabezado fijo.
    const formato = (col: number, pattern: string, type = "NUMBER") => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 },
        cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          formato(0, "yyyy-mm-dd", "DATE"),
          formato(1, "#,##0"), formato(2, "#,##0"), formato(3, "0.00"),
          formato(4, "#,##0"), formato(5, "#,##0"), formato(6, "#,##0.0"),
          formato(7, "0.00%", "PERCENT"), formato(8, "#,##0"),
        ],
      },
    });
    return { hoja: OBJETIVOS_HOJA, filas: filas.length };
  } catch (e) {
    throw traducirError(e);
  }
}
