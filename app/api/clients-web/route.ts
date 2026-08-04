import { NextResponse } from "next/server";
import { deleteRows, listRows, sheetsConfigured, upsertRow } from "@/lib/server/sheetsClient";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!sheetsConfigured()) {
    return NextResponse.json({ configured: false, rows: [] });
  }
  try {
    const rows = await listRows();
    return NextResponse.json({ configured: true, rows });
  } catch (e) {
    return NextResponse.json(
      { configured: true, rows: [], error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  if (!sheetsConfigured()) {
    return NextResponse.json({ ok: false, error: "Google Sheets no está configurado." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  try {
    if (body.action === "delete") {
      const clientId = String(body.clientId ?? "");
      if (!clientId) return NextResponse.json({ ok: false, error: "Falta clientId" }, { status: 400 });
      await deleteRows(clientId, body.projectionId ? String(body.projectionId) : undefined);
    } else {
      const row = body.row as {
        clientId?: string; clientName?: string; projectionId?: string;
        projectionName?: string; configJson?: string; entriesJson?: string; updatedAt?: string;
      };
      if (!row?.clientId || !row?.projectionId) {
        return NextResponse.json({ ok: false, error: "Falta clientId/projectionId" }, { status: 400 });
      }
      await upsertRow({
        clientId: row.clientId,
        clientName: row.clientName ?? "",
        projectionId: row.projectionId,
        projectionName: row.projectionName ?? "",
        configJson: row.configJson ?? "{}",
        entriesJson: row.entriesJson ?? "{}",
        updatedAt: row.updatedAt ?? new Date().toISOString(),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
