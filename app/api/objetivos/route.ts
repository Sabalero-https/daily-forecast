// Recibe los objetivos diarios de una proyección y los escribe en la pestaña "Objetivos"
// del spreadsheet del cliente. GET informa si la cuenta de servicio está configurada y su mail,
// para mostrarle al usuario con quién compartir el spreadsheet.
import { NextResponse } from "next/server";
import { OBJETIVOS_HEADER, ObjetivoFila, spreadsheetIdFromUrl } from "@/lib/objetivos";
import { ErrorObjetivos, cuentaDeServicio, escribirObjetivos } from "@/lib/server/objetivosSheet";

export const runtime = "nodejs";

export async function GET() {
  const email = cuentaDeServicio();
  return NextResponse.json({ configurado: Boolean(email && process.env.GOOGLE_PRIVATE_KEY), email });
}

function filaValida(f: unknown): f is ObjetivoFila {
  return Array.isArray(f) && f.length === OBJETIVOS_HEADER.length &&
    typeof f[0] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f[0]) &&
    typeof f[1] === "number" && typeof f[2] === "number" &&
    f.slice(3, 9).every((v) => v === null || typeof v === "number") && typeof f[9] === "string";
}

export async function POST(req: Request) {
  let cuerpo: { spreadsheetUrl?: unknown; filas?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El pedido no es JSON válido." }, { status: 400 });
  }
  const spreadsheetId = typeof cuerpo.spreadsheetUrl === "string" ? spreadsheetIdFromUrl(cuerpo.spreadsheetUrl) : null;
  if (!spreadsheetId) {
    return NextResponse.json({ error: "Cargá la URL del spreadsheet del cliente." }, { status: 400 });
  }
  const filas = Array.isArray(cuerpo.filas) ? cuerpo.filas : [];
  if (!filas.length || filas.length > 31 || !filas.every(filaValida)) {
    return NextResponse.json({ error: "Los objetivos no tienen el formato esperado." }, { status: 400 });
  }
  try {
    const resultado = await escribirObjetivos(spreadsheetId, filas);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    const err = e instanceof ErrorObjetivos ? e : new ErrorObjetivos(String(e), 500);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
