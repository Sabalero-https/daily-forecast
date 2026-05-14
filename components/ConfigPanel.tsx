"use client";

import { AppConfig, MonthCurve, SpecialEvent } from "@/lib/types";
import { nanoid } from "@/lib/nanoid";

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
  const monthlyInvestment =
    config.targetMER > 0 ? config.targetRevenue / config.targetMER : 0;

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

        <div className="flex flex-col gap-1">
          <label className="label">Objetivo de Facturación Mensual ($)</label>
          <input type="number" className="input" min={0} placeholder="0"
            value={config.targetRevenue || ""}
            onChange={(e) => set("targetRevenue", Number(e.target.value))} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="label">MER Objetivo</label>
          <input type="number" className="input" min={0} step={0.1} placeholder="3.0"
            value={config.targetMER || ""}
            onChange={(e) => set("targetMER", Number(e.target.value))} />
        </div>

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

        <div className="bg-zinc-800 rounded-lg px-4 py-3 flex justify-between items-center">
          <span className="text-xs text-zinc-400">Presupuesto de Inversión</span>
          <span className="text-sm font-semibold text-sky-400">
            ${monthlyInvestment.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
          </span>
        </div>
      </section>

      {/* ── Ponderación Base ── */}
      <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Ponderación Base
        </h2>
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
