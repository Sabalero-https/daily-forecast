import { AppConfig, ClientMeta, DayEntry, ProjectionMeta } from "./types";

// ── Key schema ────────────────────────────────────────────────────────────────
const CLIENTS_KEY   = "dfe_clients";
const ACTIVE_KEY    = "dfe_active";
const activeProjKey = (cid: string)              => `dfe_active_proj_${cid}`;
const projsKey      = (cid: string)              => `dfe_projs_${cid}`;
const projCfgKey    = (cid: string, pid: string) => `dfe_proj_${cid}_${pid}_cfg`;
const projDataKey   = (cid: string, pid: string) => `dfe_proj_${cid}_${pid}_data`;

// ── Default config ────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG: AppConfig = {
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  targetRevenue: 0,
  targetMER: 3,
  guideAOV: 0,
  guideCR: 0,
  dayWeights: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  monthCurve: { early: 1.0, mid: 1.0, late: 1.0 },
  specialEvents: [],
};

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

// ── Clients ───────────────────────────────────────────────────────────────────
export function loadClients(): ClientMeta[] {
  if (typeof window === "undefined") return [];
  return safe(() => JSON.parse(localStorage.getItem(CLIENTS_KEY) ?? "[]"), []);
}
export function saveClients(clients: ClientMeta[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
}
export function loadActiveClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}
export function saveActiveClientId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, id);
}

// ── Projections list ──────────────────────────────────────────────────────────
export function loadProjections(cid: string): ProjectionMeta[] {
  if (typeof window === "undefined") return [];
  return safe(() => JSON.parse(localStorage.getItem(projsKey(cid)) ?? "[]"), []);
}
export function saveProjections(cid: string, projs: ProjectionMeta[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(projsKey(cid), JSON.stringify(projs));
}
export function loadActiveProjId(cid: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(activeProjKey(cid));
}
export function saveActiveProjId(cid: string, pid: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(activeProjKey(cid), pid);
}

// ── Projection data ───────────────────────────────────────────────────────────
export function loadProjectionConfig(cid: string, pid: string): AppConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  return safe(
    () => ({ ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(projCfgKey(cid, pid)) ?? "{}") }),
    DEFAULT_CONFIG
  );
}
export function saveProjectionConfig(cid: string, pid: string, config: AppConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(projCfgKey(cid, pid), JSON.stringify(config));
}
export function loadProjectionEntries(cid: string, pid: string): Record<string, DayEntry> {
  if (typeof window === "undefined") return {};
  return safe(() => JSON.parse(localStorage.getItem(projDataKey(cid, pid)) ?? "{}"), {});
}
export function saveProjectionEntries(
  cid: string, pid: string, entries: Record<string, DayEntry>
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(projDataKey(cid, pid), JSON.stringify(entries));
}

// ── Delete all keys for a projection ─────────────────────────────────────────
export function deleteProjectionData(cid: string, pid: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(projCfgKey(cid, pid));
  localStorage.removeItem(projDataKey(cid, pid));
}

// ── Delete all keys for a client ─────────────────────────────────────────────
export function deleteClientData(cid: string): void {
  if (typeof window === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (
      k === projsKey(cid) ||
      k === activeProjKey(cid) ||
      k.startsWith(`dfe_proj_${cid}_`)
    )) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

// ── Migration from previous schema (dfe_cfg_{cid}) ───────────────────────────
function migrateClientIfNeeded(cid: string): void {
  if (localStorage.getItem(projsKey(cid))) return; // already on new schema

  const oldCfg = localStorage.getItem(`dfe_cfg_${cid}`);
  const pid = "proj_default";
  saveProjections(cid, [{ id: pid, name: "Proyección Principal" }]);
  saveActiveProjId(cid, pid);
  if (oldCfg) {
    localStorage.setItem(projCfgKey(cid, pid), oldCfg);
    localStorage.removeItem(`dfe_cfg_${cid}`);
  }
  // Old dfe_data_{cid}_{y}_{m} keys are left in place; they won't conflict.
}

// ── Bootstrap helpers ─────────────────────────────────────────────────────────
export function bootstrapClients(): { clients: ClientMeta[]; activeId: string } {
  let clients = loadClients();
  let activeId = loadActiveClientId();

  if (clients.length === 0) {
    clients = [{ id: "client_default", name: "Mi Cliente" }];
    saveClients(clients);
  }
  if (!activeId || !clients.find((c) => c.id === activeId)) {
    activeId = clients[0].id;
    saveActiveClientId(activeId);
  }
  return { clients, activeId };
}

export function bootstrapProjections(
  cid: string,
  fallbackId: string
): { projs: ProjectionMeta[]; activeProjId: string } {
  migrateClientIfNeeded(cid);

  let projs = loadProjections(cid);
  let activeProjId = loadActiveProjId(cid) ?? "";

  if (projs.length === 0) {
    const defaultProj: ProjectionMeta = { id: fallbackId, name: "Proyección Principal" };
    projs = [defaultProj];
    saveProjections(cid, projs);
    activeProjId = fallbackId;
    saveActiveProjId(cid, activeProjId);
  } else if (!projs.find((p) => p.id === activeProjId)) {
    activeProjId = projs[0].id;
    saveActiveProjId(cid, activeProjId);
  }
  return { projs, activeProjId };
}
