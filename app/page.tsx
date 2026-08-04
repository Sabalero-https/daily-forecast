"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfigPanel from "@/components/ConfigPanel";
import ForecastTable from "@/components/ForecastTable";
import { AppConfig, ClientMeta, DailyMetric, DayEntry, ProjectionMeta } from "@/lib/types";
import { computeDays, computeTotals, toDateStr } from "@/lib/calc";
import {
  DEFAULT_CONFIG,
  bootstrapClients,
  bootstrapProjections,
  deleteClientData,
  deleteProjectionData,
  loadActiveClientId,
  loadActiveProjId,
  loadClients,
  loadProjectionConfig,
  loadProjectionEntries,
  loadProjections,
  saveActiveClientId,
  saveActiveProjId,
  saveClients,
  saveProjectionConfig,
  saveProjectionEntries,
  saveProjections,
} from "@/lib/storage";
import { nanoid } from "@/lib/nanoid";
import { CloudRow, deleteCloudRows, fetchCloudRows, pushCloudRow } from "@/lib/cloudSync";

const SHEETS_MIGRATED_KEY = "dfe_sheets_migrated";

type CreatingMode = "client" | "projection" | null;

// ── InlineForm MUST live outside Home so React never unmounts it on re-render ─
interface InlineFormProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}
function InlineForm({ inputRef, value, placeholder, onChange, onConfirm, onCancel }: InlineFormProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        className="bg-zinc-800 border border-sky-600 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500 w-44"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter")  onConfirm();
          if (e.key === "Escape") onCancel();
        }}
      />
      <button
        onClick={onConfirm}
        className="text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg transition-colors"
      >
        Crear
      </button>
      <button
        onClick={onCancel}
        className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}

// ── Cloud sync helpers (puras, sin estado) ─────────────────────────────────────
function rowsToClients(rows: CloudRow[]): ClientMeta[] {
  const seen = new Map<string, string>();
  for (const r of rows) if (!seen.has(r.clientId)) seen.set(r.clientId, r.clientName);
  return Array.from(seen, ([id, name]) => ({ id, name }));
}
function rowsToProjections(rows: CloudRow[], clientId: string): ProjectionMeta[] {
  return rows.filter((r) => r.clientId === clientId).map((r) => ({ id: r.projectionId, name: r.projectionName }));
}
function findCloudRow(rows: CloudRow[], clientId: string, projectionId: string): CloudRow | undefined {
  return rows.find((r) => r.clientId === clientId && r.projectionId === projectionId);
}

// ── Trash icon ────────────────────────────────────────────────────────────────
function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [clients,        setClients]        = useState<ClientMeta[]>([]);
  const [activeClientId, setActiveClientId] = useState("");
  const [projections,    setProjections]    = useState<ProjectionMeta[]>([]);
  const [activeProjId,   setActiveProjId]   = useState("");
  const [config,         setConfig]         = useState<AppConfig | null>(null);
  const [entries,        setEntries]        = useState<Record<string, DayEntry>>({});
  const [hydrated,       setHydrated]       = useState(false);
  const [creating,       setCreating]       = useState<CreatingMode>(null);
  const [newName,        setNewName]        = useState("");
  const [saveFlash,      setSaveFlash]      = useState(false);
  // CSV de Tiendanube cargado en esta sesión — NO se persiste (se resube cada
  // vez), solo se usa para auto-completar Reality Revenue/Pedidos en la tabla.
  const [tnMetrics,      setTnMetrics]      = useState<DailyMetric[] | null>(null);
  // true si Google Sheets está configurado y respondió al menos una vez esta
  // sesión — mientras sea false, todo sigue funcionando 100% con localStorage
  // exactamente como antes.
  const [cloudEnabled,   setCloudEnabled]   = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Boot ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const { clients: cls, activeId: cid } = bootstrapClients();
    const { projs, activeProjId: pid }    = bootstrapProjections(cid, nanoid());
    setClients(cls);
    setActiveClientId(cid);
    setProjections(projs);
    setActiveProjId(pid);
    setConfig(loadProjectionConfig(cid, pid));
    setEntries(loadProjectionEntries(cid, pid));
    setHydrated(true);
  }, []);

  // ── Boot desde Google Sheets (si está configurado) ─────────────────────────────
  // Corre después del boot local de arriba. Si Sheets tiene datos, se usan como
  // fuente de verdad (y se reflejan también en localStorage, como caché). Si
  // Sheets está configurado pero vacío y localStorage ya tenía clientes, se
  // migran una sola vez (flag en localStorage). Si Sheets no responde o no está
  // configurado, no se toca nada — la app sigue 100% con lo que cargó arriba.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cloud = await fetchCloudRows();
      if (cancelled || !cloud || !cloud.configured) return;

      if (cloud.rows.length > 0) {
        const cls = rowsToClients(cloud.rows);
        if (cls.length === 0) return;
        const cid = cls.find((c) => c.id === loadActiveClientId())?.id ?? cls[0].id;
        const projs = rowsToProjections(cloud.rows, cid);
        if (projs.length === 0) return;
        const pid = projs.find((p) => p.id === loadActiveProjId(cid))?.id ?? projs[0].id;
        const row = findCloudRow(cloud.rows, cid, pid);
        if (!row) return;

        const cfg: AppConfig = { ...DEFAULT_CONFIG, ...JSON.parse(row.configJson || "{}") };
        const ent: Record<string, DayEntry> = JSON.parse(row.entriesJson || "{}");

        saveClients(cls);
        saveActiveClientId(cid);
        saveProjections(cid, projs);
        saveActiveProjId(cid, pid);
        saveProjectionConfig(cid, pid, cfg);
        saveProjectionEntries(cid, pid, ent);

        if (cancelled) return;
        setClients(cls);
        setActiveClientId(cid);
        setProjections(projs);
        setActiveProjId(pid);
        setConfig(cfg);
        setEntries(ent);
        setCloudEnabled(true);
        return;
      }

      // Sheets configurado pero vacío: migrar localStorage una sola vez.
      if (localStorage.getItem(SHEETS_MIGRATED_KEY) === "1") {
        setCloudEnabled(true);
        return;
      }
      const localClients = loadClients();
      for (const c of localClients) {
        const localProjs = loadProjections(c.id);
        const projList = localProjs.length > 0 ? localProjs : [{ id: "proj_default", name: "Proyección Principal" }];
        for (const p of projList) {
          const cfg = loadProjectionConfig(c.id, p.id);
          const ent = loadProjectionEntries(c.id, p.id);
          await pushCloudRow({
            clientId: c.id,
            clientName: c.name,
            projectionId: p.id,
            projectionName: p.name,
            configJson: JSON.stringify(cfg),
            entriesJson: JSON.stringify(ent),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      localStorage.setItem(SHEETS_MIGRATED_KEY, "1");
      if (!cancelled) setCloudEnabled(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (creating) nameInputRef.current?.focus();
  }, [creating]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  function switchProjection(cid: string, pid: string) {
    saveActiveProjId(cid, pid);
    setActiveProjId(pid);
    setConfig(loadProjectionConfig(cid, pid));
    setEntries(loadProjectionEntries(cid, pid));
    setTnMetrics(null); // el CSV de la sesión era del contexto anterior
  }

  function switchClient(cid: string) {
    saveActiveClientId(cid);
    setActiveClientId(cid);
    const { projs, activeProjId: pid } = bootstrapProjections(cid, nanoid());
    setProjections(projs);
    switchProjection(cid, pid);
  }

  // ── Create ────────────────────────────────────────────────────────────────────
  function confirmCreateClient() {
    const name = newName.trim();
    if (!name) { cancelCreating(); return; }
    const id = nanoid();
    const updated = [...clients, { id, name }];
    saveClients(updated);
    setClients(updated);
    cancelCreating();
    switchClient(id);
    if (cloudEnabled) {
      // Fila inicial con la proyección default que switchClient/bootstrapProjections
      // va a crear localmente — así el cliente no "desaparece" en la nube si
      // recargás antes de tocar nada.
      pushCloudRow({
        clientId: id, clientName: name,
        projectionId: "proj_default", projectionName: "Proyección Principal",
        configJson: JSON.stringify(DEFAULT_CONFIG), entriesJson: "{}",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  function confirmCreateProjection() {
    const name = newName.trim();
    if (!name) { cancelCreating(); return; }
    const pid = nanoid();
    const updated = [...projections, { id: pid, name }];
    saveProjections(activeClientId, updated);
    setProjections(updated);
    saveProjectionConfig(activeClientId, pid, DEFAULT_CONFIG);
    cancelCreating();
    switchProjection(activeClientId, pid);
    if (cloudEnabled) {
      const clientName = clients.find((c) => c.id === activeClientId)?.name ?? "";
      pushCloudRow({
        clientId: activeClientId, clientName,
        projectionId: pid, projectionName: name,
        configJson: JSON.stringify(DEFAULT_CONFIG), entriesJson: "{}",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  function cancelCreating() { setCreating(null); setNewName(""); }

  // ── Delete ────────────────────────────────────────────────────────────────────
  function deleteClient(cid: string) {
    if (clients.length <= 1) return;
    const name = clients.find((c) => c.id === cid)?.name ?? "";
    if (!confirm(`¿Eliminar cliente "${name}"? Se borrarán todas sus proyecciones y datos.`)) return;
    deleteClientData(cid);
    const updated = clients.filter((c) => c.id !== cid);
    saveClients(updated);
    setClients(updated);
    if (cid === activeClientId) switchClient(updated[0].id);
    if (cloudEnabled) deleteCloudRows(cid);
  }

  function deleteProjection(pid: string) {
    if (projections.length <= 1) return;
    const name = projections.find((p) => p.id === pid)?.name ?? "";
    if (!confirm(`¿Eliminar proyección "${name}"?`)) return;
    deleteProjectionData(activeClientId, pid);
    const updated = projections.filter((p) => p.id !== pid);
    saveProjections(activeClientId, updated);
    setProjections(updated);
    if (pid === activeProjId) switchProjection(activeClientId, updated[0].id);
    if (cloudEnabled) deleteCloudRows(activeClientId, pid);
  }

  // ── Save flash ────────────────────────────────────────────────────────────────
  function handleSave() {
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  }

  // ── Data handlers ─────────────────────────────────────────────────────────────
  function pushCurrentToCloud(cfg: AppConfig, ent: Record<string, DayEntry>) {
    if (!cloudEnabled) return;
    pushCloudRow({
      clientId: activeClientId,
      clientName: clients.find((c) => c.id === activeClientId)?.name ?? "",
      projectionId: activeProjId,
      projectionName: projections.find((p) => p.id === activeProjId)?.name ?? "",
      configJson: JSON.stringify(cfg),
      entriesJson: JSON.stringify(ent),
      updatedAt: new Date().toISOString(),
    });
  }

  function handleConfigChange(next: AppConfig) {
    setConfig(next);
    saveProjectionConfig(activeClientId, activeProjId, next);
    pushCurrentToCloud(next, entries);
  }

  function handleUpdateEntry(date: string, patch: Partial<DayEntry>) {
    setEntries((prev) => {
      const current: DayEntry = prev[date] ?? {
        date, weightOverride: null,
        realityRevenue: null, realitySpend: null,
        realitySessions: null, realityOrders: null,
      };
      const next = { ...prev, [date]: { ...current, ...patch } };
      saveProjectionEntries(activeClientId, activeProjId, next);
      if (config) pushCurrentToCloud(config, next);
      return next;
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  // Vista de solo-cálculo: entries reales + overlay del CSV de Tiendanube (si hay
  // uno cargado en la sesión) para Revenue/Pedidos. No se persiste — `entries` en
  // sí queda intacto, así ninguna carga manual se pisa en localStorage/Sheets.
  const displayEntries = useMemo(() => {
    if (!tnMetrics) return entries;
    const merged = { ...entries };
    for (const m of tnMetrics) {
      const existing = merged[m.date];
      merged[m.date] = {
        date: m.date,
        weightOverride: existing?.weightOverride ?? null,
        realityRevenue: m.revenue,
        realitySpend: existing?.realitySpend ?? null,
        realitySessions: existing?.realitySessions ?? null,
        realityOrders: m.pedidos,
      };
    }
    return merged;
  }, [entries, tnMetrics]);

  const days   = useMemo(() => config ? computeDays(config, displayEntries) : [], [config, displayEntries]);
  const totals = useMemo(() => computeTotals(days, toDateStr(new Date())), [days]);
  const tiendanubeCoverage = useMemo(() => new Set((tnMetrics ?? []).map((m) => m.date)), [tnMetrics]);

  if (!hydrated || !config) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-600 text-sm">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* ── Header ── */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 xl:px-8 py-2.5 flex items-center gap-3 flex-wrap">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l7-7 4 4 7-7M3 20h18" />
              </svg>
            </div>
            <span className="font-bold text-sm tracking-tight text-white hidden sm:block">
              Daily Forecast Engine
            </span>
          </div>

          <div className="h-5 w-px bg-zinc-700 hidden md:block" />

          {/* ── Cliente group ── */}
          {creating === "client" ? (
            <InlineForm
              inputRef={nameInputRef}
              value={newName}
              placeholder="Nombre del cliente…"
              onChange={setNewName}
              onConfirm={confirmCreateClient}
              onCancel={cancelCreating}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 shrink-0 hidden sm:block">
                Cliente
              </span>
              <select
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors max-w-[140px]"
                value={activeClientId}
                onChange={(e) => switchClient(e.target.value)}
              >
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                onClick={() => setCreating("client")}
                className="text-[11px] font-medium text-sky-400 hover:text-sky-300 px-2 py-1.5 rounded-lg border border-sky-800 hover:border-sky-600 transition-colors shrink-0"
              >
                + Nuevo
              </button>
              {clients.length > 1 && (
                <button
                  onClick={() => deleteClient(activeClientId)}
                  className="text-zinc-600 hover:text-red-400 transition-colors p-1.5"
                  title="Eliminar cliente"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          )}

          <div className="h-5 w-px bg-zinc-700 hidden md:block" />

          {/* ── Proyección group ── */}
          {creating === "projection" ? (
            <InlineForm
              inputRef={nameInputRef}
              value={newName}
              placeholder="Nombre de la proyección…"
              onChange={setNewName}
              onConfirm={confirmCreateProjection}
              onCancel={cancelCreating}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 shrink-0 hidden sm:block">
                Proyección
              </span>
              <select
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors max-w-[160px]"
                value={activeProjId}
                onChange={(e) => switchProjection(activeClientId, e.target.value)}
              >
                {projections.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                onClick={() => setCreating("projection")}
                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 px-2 py-1.5 rounded-lg border border-emerald-800 hover:border-emerald-600 transition-colors shrink-0"
              >
                + Nueva
              </button>
              <button
                onClick={handleSave}
                className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
                  saveFlash
                    ? "bg-emerald-700 border-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200 border-zinc-700 hover:border-zinc-500"
                }`}
              >
                {saveFlash ? "✓ Guardado" : "Guardar"}
              </button>
              {projections.length > 1 && (
                <button
                  onClick={() => deleteProjection(activeProjId)}
                  className="text-zinc-600 hover:text-red-400 transition-colors p-1.5"
                  title="Eliminar proyección"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          )}

          <span
            className={`text-[10px] px-2 py-1 rounded-full border ml-auto shrink-0 ${
              cloudEnabled
                ? "border-emerald-800 text-emerald-400"
                : "border-zinc-700 text-zinc-600"
            }`}
            title={cloudEnabled ? "Sincronizado con Google Sheets" : "Guardando solo en este navegador (localStorage)"}
          >
            {cloudEnabled ? "☁ Sheets" : "💾 Local"}
          </span>

          <span className="text-zinc-600 text-xs shrink-0 hidden lg:block">
            {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-[1600px] mx-auto px-4 xl:px-8 py-6 flex flex-col xl:flex-row gap-6">
        <ConfigPanel config={config} onChange={handleConfigChange} onTiendanubeMetrics={setTnMetrics} />
        <ForecastTable
          config={config}
          days={days}
          totals={totals}
          entries={entries}
          onUpdateEntry={handleUpdateEntry}
          tiendanubeCoverage={tiendanubeCoverage}
        />
      </main>
    </div>
  );
}
