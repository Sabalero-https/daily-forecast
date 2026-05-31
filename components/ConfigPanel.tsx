"use client";

import { useRef, useState } from "react";
import { AppConfig, MonthCurve, ProjectionMode, SpecialEvent } from "@/lib/types";
import { nanoid } from "@/lib/nanoid";
import { parseAndComputeWeights } from "@/lib/autoWeights";

const PROJECTION_MODES: { value: ProjectionMode; label: string; derived: string }[] = [
  { value: "revenue_mer",   label: "Facturación + MER → Inversión",    derived: "Inversión" },
  { value: "spend_mer",     label: "Inversión + MER → Facturación",    derived: "Facturación" },
  { value: "spend_revenue", label: "Inversión + Facturación → MER",    derived: "MER" },
];

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Props {
  config: AppConfig;
  onChange: (config: AppConfig) => void;
}

export default function ConfigPanel({ config, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [weightError, setWeightError] = useState<string | null>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const result = parseAndComputeWeights(text);
      if (!result.ok) { setWeightError(result.error); return; }
      setWeightError(null);
      onChange({ ...config, dayWeights: result.weights, monthCurve: result.monthCurve, autoWeightsMeta: result.meta });
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  const mode = config.projectionMode ?? "revenue_mer";

  const derivedValue: number = (() => {
    switch (mode) {
      case "spend_mer":     return config.targetSpend * config.targetMER;
      case "spend_revenue": return config.targetSpend > 0 ? config.targetRevenue / config.targetSpend : 0;
      default:              return config.targetMER > 0 ? config.targetRevenue / config.targetMER : 0;
    }
  })();

  const derivedLabel = PROJECTION_MODES.find((m) => m.value === mode)?.derived ?? "Inversión";

  function set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  function setDayWeight(idx: number, val: number) {
    const next = [...config.dayWeights] as AppConfig["dayWeights"];
    next[idx] = val;
    onChange({ ...config, dayWeights: next });
  }

  function setCurve(key: keyof MonthCurve, val: number) {
    onChange({ ...config, monthCurve: { ...config.monthCurve, [key]: val } });
  }

  function addEvent() {
    const dateStr = `${config.year}-${String(config.month + 1).padStart(2, "0")}-01`;
    const event: SpecialEvent = { id: nanoid(), date: dateStr, label: "", weight: 0.5 };
    set("specialEvents", [...config.specialEvents, event]);
  }

  function updateEvent(id: string, patch: Partial<SpecialEvent>) {
    set(
      "specialEvents",
      config.specialEvents.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  }

  function removeEvent(id: string) {
    set("specialEvents", config.specialEvents.filter((e) => e.id !== id));
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i);
  const monthPad = String(config.month + 1).padStart(2, "0");

  return (
    <aside className="w-full xl:w-80 shrink-0 flex flex-col gap-6">

      {/* ── Variables del Mes ── */}
      <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Variables del Mes
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="label">Mes</label>
            <select className="input" value={config.month} onChange={(e) => set("month", Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="label">Año</label>
            <select className="input" value={config.year} onChange={(e) => set("year", Number(e.target.value))}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex flex-col gap-1">
          <label className="label">Modo de proyección</label>
          <select
            className="input"
            value={mode}
            onChange={(e) => set("projectionMode", e.target.value as ProjectionMode)}
          >
            {PROJECTION_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Facturación — input in revenue_mer and spend_revenue modes */}
        {(mode === "revenue_mer" || mode === "spend_revenue") && (
          <div className="flex flex-col gap-1">
            <label className="label">Facturación Mensual Objetivo ($)</label>
            <input type="number" className="input" min={0} placeholder="0"
              value={config.targetRevenue || ""}
              onChange={(e) => set("targetRevenue", Number(e.target.value))} />
          </div>
        )}

        {/* Inversión — input in spend_mer and spend_revenue modes */}
        {(mode === "spend_mer" || mode === "spend_revenue") && (
          <div className="flex flex-col gap-1">
            <label className="label">Presupuesto de Inversión ($)</label>
            <input type="number" className="input" min={0} placeholder="0"
              value={config.targetSpend || ""}
              onChange={(e) => set("targetSpend", Number(e.target.value))} />
          </div>
        )}

        {/* MER — input in revenue_mer and spend_mer modes */}
        {(mode === "revenue_mer" || mode === "spend_mer") && (
          <div className="flex flex-col gap-1">
            <label className="label">MER Objetivo</label>
            <input type="number" className="input" min={0} step={0.1} placeholder="3.0"
              value={config.targetMER || ""}
              onChange={(e) => set("targetMER", Number(e.target.value))} />
          </div>
        )}

        {/* AOV + CR always visible */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="label">AOV Guía ($)</label>
            <input type="number" className="input" min={0} step={0.01} placeholder="0"
              value={config.guideAOV || ""}
              onChange={(e) => set("guideAOV", Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="label">CR Guía (%)</label>
            <input type="number" className="input" min={0} step={0.01} placeholder="0"
              value={config.guideCR || ""}
              onChange={(e) => set("guideCR", Number(e.target.value))} />
          </div>
        </div>

        {/* Derived value display */}
        <div className="bg-zinc-800 rounded-lg px-4 py-3 flex justify-between items-center">
          <span className="text-xs text-zinc-400">
            {derivedLabel} <span className="text-zinc-600">(derivado)</span>
          </span>
          <span className="text-sm font-semibold text-sky-400">
            {mode === "spend_revenue"
              ? derivedValue.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "x"
              : "$" + derivedValue.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
          </span>
        </div>
      </section>

      {/* ── Ponderación Base ── */}
      <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Ponderación Base
          </h2>
          {/* Manual / Auto toggle */}
          <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-[11px] font-medium shrink-0">
            <button
              className={`px-3 py-1 transition-colors ${config.weightMode !== "auto" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
              onClick={() => { set("weightMode", "manual"); setWeightError(null); }}
            >
              Manual
            </button>
            <button
              className={`px-3 py-1 transition-colors ${config.weightMode === "auto" ? "bg-sky-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              onClick={() => { set("weightMode", "auto"); setWeightError(null); }}
            >
              Auto
            </button>
          </div>
        </div>

        {config.weightMode === "auto" ? (
          <div className="flex flex-col gap-3">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Upload area or loaded metadata */}
            {config.autoWeightsMeta ? (
              <div className="bg-zinc-800 rounded-lg px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-emerald-400 font-medium">
                    ✓ {config.autoWeightsMeta.rowCount.toLocaleString("es-AR")} ventas · {config.autoWeightsMeta.monthCount} meses
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {config.autoWeightsMeta.dateFrom} → {config.autoWeightsMeta.dateTo}
                  </span>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-zinc-500 hover:text-sky-400 transition-colors shrink-0 mt-0.5"
                >
                  Re-cargar
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-zinc-700 hover:border-sky-600 rounded-lg p-4 text-center transition-colors group flex flex-col items-center gap-1.5"
              >
                <svg className="w-5 h-5 text-zinc-600 group-hover:text-sky-500 transition-colors" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  Subir CSV de ventas históricas
                </span>
                <span className="text-[10px] text-zinc-700">
                  Mínimo 3 meses · columnas fecha y monto
                </span>
              </button>
            )}

            {/* Error message */}
            {weightError && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-3 py-2 text-[11px] text-red-400 leading-relaxed">
                {weightError}
              </div>
            )}

            {/* Weights read-only */}
            <div>
              <p className="text-[10px] text-zinc-600 mb-2">Pesos calculados (solo lectura)</p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_LABELS.map((day, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-zinc-500 font-medium">{day}</span>
                    <input
                      type="number"
                      className="input text-center px-1 text-xs opacity-50 cursor-not-allowed"
                      value={config.dayWeights[i]}
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_LABELS.map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-zinc-500 font-medium">{day}</span>
                <input type="number" className="input text-center px-1 text-xs" min={0} step={0.1}
                  value={config.dayWeights[i]}
                  onChange={(e) => setDayWeight(i, Number(e.target.value))} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Curva del Mes ── */}
      <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Curva del Mes
          </h2>
          <p className="text-[10px] text-zinc-600 mt-1">
            Multiplicador por etapa del mes (efecto sueldo, etc.)
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { key: "early", label: "Días 1–10" },
              { key: "mid",   label: "Días 11–20" },
              { key: "late",  label: "Días 21–fin" },
            ] as { key: keyof MonthCurve; label: string }[]
          ).map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-zinc-500 font-medium text-center">{label}</span>
              <input type="number" className="input text-center px-1 text-xs" min={0} step={0.01}
                value={config.monthCurve[key]}
                onChange={(e) => setCurve(key, Number(e.target.value))} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Eventos Especiales ── */}
      <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Eventos Especiales
            </h2>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Varios eventos en la misma fecha se acumulan
            </p>
          </div>
          <button
            onClick={addEvent}
            className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors px-2 py-1 rounded border border-sky-700 hover:border-sky-500 shrink-0"
          >
            + Agregar
          </button>
        </div>

        {config.specialEvents.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-2">Sin eventos especiales</p>
        )}

        <div className="flex flex-col gap-3">
          {config.specialEvents.map((event) => (
            <div key={event.id} className="bg-zinc-800 rounded-lg p-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input flex-1 text-xs"
                  value={event.date}
                  min={`${config.year}-${monthPad}-01`}
                  max={`${config.year}-${monthPad}-31`}
                  onChange={(e) => updateEvent(event.id, { date: e.target.value })}
                />
                <button
                  onClick={() => removeEvent(event.id)}
                  className="text-zinc-500 hover:text-red-400 transition-colors text-lg leading-none px-1"
                  title="Eliminar evento"
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                className="input text-xs"
                placeholder="Etiqueta (ej: Email Promo)"
                value={event.label}
                onChange={(e) => updateEvent(event.id, { label: e.target.value })}
              />
              <div className="flex flex-col gap-1">
                <label className="label">Peso adicional (+)</label>
                <input
                  type="number"
                  className="input text-xs"
                  min={0}
                  step={0.1}
                  value={event.weight}
                  onChange={(e) => updateEvent(event.id, { weight: Number(e.target.value) })}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
