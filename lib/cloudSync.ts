"use client";

// Wrapper de fetch a /api/clients-web — nunca lanza, siempre devuelve null/false
// en caso de error de red para que el caller pueda seguir con localStorage.

export interface CloudRow {
  clientId: string;
  clientName: string;
  projectionId: string;
  projectionName: string;
  configJson: string;
  entriesJson: string;
  updatedAt: string;
}

export interface CloudListResult {
  configured: boolean;
  rows: CloudRow[];
}

export async function fetchCloudRows(): Promise<CloudListResult | null> {
  try {
    const res = await fetch("/api/clients-web", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as CloudListResult;
  } catch {
    return null;
  }
}

export async function pushCloudRow(row: CloudRow): Promise<boolean> {
  try {
    const res = await fetch("/api/clients-web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", row }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteCloudRows(clientId: string, projectionId?: string): Promise<boolean> {
  try {
    const res = await fetch("/api/clients-web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", clientId, projectionId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
