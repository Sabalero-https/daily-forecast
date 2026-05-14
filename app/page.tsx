"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfigPanel from "@/components/ConfigPanel";
import ForecastTable from "@/components/ForecastTable";
import { AppConfig, ClientMeta, DayEntry, ProjectionMeta } from "@/lib/types";
import { computeDays, computeTotals, toDateStr } from "@/lib/calc";
import {
  DEFAULT_CONFIG,
  bootstrapClients,
  bootstrapProjections,
  deleteClientData,
  deleteProjectionData,
  loadProjectionConfig,
  loadProjectionEntries,
  saveActiveClientId,
  saveActiveProjId,
  saveClients,
  saveProjectionConfig,
  saveProjectionEntries,
  saveProjections,
} from "@/lib/storage";
import { nanoid } from "@/lib/nanoid";

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

  useEffect(() => {
    if (creating) nameInputRef.current?.focus();
  }, [creating]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  function switchProjection(cid: string, pid: string) {
    saveActiveProjId(cid, pid);
    setActiveProjId(pid);
    setConfig(loadProjectionConfig(cid, pid));
    setEntries(loadProjectionEntries(cid, pid));
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
  }

  // ── Save flash ────────────────────────────────────────────────────────────────
  function handleSave() {
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  }

  // ── Data handlers ─────────────────────────────────────────────────────────────
  function handleConfigChange(next: AppConfig) {
    setConfig(next);
    saveProjectionConfig(activeClientId, activeProjId, next);
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
      return next;
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const days   = useMemo(() => config ? computeDays(config, entries) : [], [config, entries]);
  const totals = useMemo(() => computeTotals(days, toDateStr(new Date())), [days]);

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

          <span className="text-zinc-600 text-xs ml-auto shrink-0 hidden lg:block">
            {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-[1600px] mx-auto px-4 xl:px-8 py-6 flex flex-col xl:flex-row gap-6">
        <ConfigPanel config={config} onChange={handleConfigChange} />
        <ForecastTable
          config={config}
          days={days}
          totals={totals}
          entries={entries}
          onUpdateEntry={handleUpdateEntry}
        />
      </main>
    </div>
  );
}
