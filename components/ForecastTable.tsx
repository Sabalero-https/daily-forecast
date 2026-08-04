"use client";

import { AppConfig, ComputedDay, DayEntry } from "@/lib/types";
import { TotalsRow, exportToCSV } from "@/lib/calc";
import clsx from "clsx";

interface Props {
  config: AppConfig;
  days: ComputedDay[];
  totals: TotalsRow;
  entries: Record<string, DayEntry>;
  onUpdateEntry: (date: string, patch: Partial<DayEntry>) => void;
  // Fechas cubiertas por un CSV de Tiendanube cargado en esta sesión — esos días
  // muestran Revenue/Pedidos derivados del CSV (solo lectura) en vez del input manual.
  tiendanubeCoverage?: Set<string>;
}

// ── Event badge palette ───────────────────────────────────────────────────────
const BADGE_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-purple-100 text-purple-800",
  "bg-green-100 text-green-800",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-800",
];

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined, fallback = "—"): string {
  if (n == null) return fallback;
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtNum(n: number | null | undefined, fallback = "—"): string {
  if (n == null) return fallback;
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct(ratio: number | null): string {
  if (ratio == null) return "—";
  return (ratio * 100).toFixed(1) + "%";
}

function fmtCR(pct: number | null): string {
  if (pct == null) return "0%";
  return pct.toFixed(2) + "%";
}

function fmtAOV(n: number | null): string {
  if (n == null) return "$0";
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtMER(n: number | null): string {
  if (n == null) return "—";
  return "x" + n.toFixed(2);
}

function PacingBadge({ ratio }: { ratio: number | null }) {
  if (ratio == null) return <span className="text-zinc-600 text-xs">—</span>;
  const pct = ratio * 100;
  const cls = clsx(
    "inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
    pct >= 105 ? "bg-emerald-900 text-emerald-300" :
    pct >= 90  ? "bg-yellow-900 text-yellow-300" :
                 "bg-red-900 text-red-300"
  );
  return <span className={cls}>{fmtPct(ratio)}</span>;
}

// ── Celda de solo lectura para valores auto-completados desde el CSV de Tiendanube ──

function TiendanubeCell({ value, fmt }: { value: number; fmt: (n: number) => string }) {
  return (
    <div
      className="w-full text-right px-1 py-0.5 text-xs tabular-nums text-emerald-400/80"
      title="Auto-completado desde el CSV de Tiendanube de esta sesión"
    >
      {fmt(value)}
    </div>
  );
}

// ── Inline editable number cell ───────────────────────────────────────────────

function EditableCell({
  value,
  onChange,
  placeholder = "",
  highlight = "default",
  step = 0.01,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  highlight?: "default" | "green";
  step?: number;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={clsx(
        "w-full bg-transparent border border-transparent rounded px-1 py-0.5 text-xs tabular-nums text-right",
        "focus:outline-none focus:border-zinc-600 focus:bg-zinc-800",
        "hover:border-zinc-700 transition-colors",
        highlight === "green" ? "text-emerald-400" : "text-zinc-200"
      )}
    />
  );
}

// ── CSV download ──────────────────────────────────────────────────────────────

function downloadCSV(days: ComputedDay[]) {
  const csv = exportToCSV(days);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-forecast.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Métricas Guía panel ───────────────────────────────────────────────────────

function MetricasGuia({ config, totals }: { config: AppConfig; totals: TotalsRow }) {
  const { targetRevenue, guideAOV, guideCR } = config;
  const crRatio = guideCR > 0 ? guideCR / 100 : 0;

  const neededOrders = guideAOV > 0 ? targetRevenue / guideAOV : null;
  const neededSessions = neededOrders != null && crRatio > 0 ? neededOrders / crRatio : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <GuideCard
        label="Pedidos necesarios"
        value={neededOrders != null ? fmtNum(neededOrders) : "—"}
        sub="Facturación / AOV"
        accent="amber"
      />
      <GuideCard
        label="Sesiones necesarias"
        value={neededSessions != null ? fmtNum(neededSessions) : "—"}
        sub="Pedidos / CR"
        accent="amber"
      />
      <GuideCard
        label="Sesiones reales"
        value={fmtNum(totals.totalRealitySessions)}
        sub="Acumulado del mes"
        accent="emerald"
      />
      <GuideCard
        label="Pedidos reales"
        value={fmtNum(totals.totalRealityOrders)}
        sub={`CR: ${fmtCR(totals.realCR)} · AOV: ${fmtAOV(totals.realAOV)}`}
        accent="emerald"
      />
    </div>
  );
}

function GuideCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "amber" | "emerald";
}) {
  return (
    <div className={clsx(
      "bg-zinc-900 border rounded-xl px-4 py-3",
      accent === "amber" ? "border-amber-800" : "border-emerald-800"
    )}>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <p className={clsx(
        "text-xl font-bold tabular-nums",
        accent === "amber" ? "text-amber-300" : "text-emerald-300"
      )}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ForecastTable({
  config, days, totals, entries, onUpdateEntry, tiendanubeCoverage,
}: Props) {
  if (days.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Configurá el mes para ver la tabla de forecast.
      </div>
    );
  }

  function handleWeight(date: string, val: string) {
    onUpdateEntry(date, { weightOverride: val === "" ? null : Number(val) });
  }

  return (
    <div className="flex-1 flex flex-col gap-4 min-w-0">

      {/* Métricas Guía */}
      <MetricasGuia config={config} totals={totals} />

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">
          Tabla de Forecast — {days.length} días
        </h2>
        <button
          onClick={() => downloadCSV(days)}
          className="flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
          </svg>
          Exportar CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-700">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-800 text-zinc-400 uppercase tracking-wider">
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Fecha</th>
              <th className="px-3 py-2.5 text-left font-semibold">Día</th>
              <th className="px-3 py-2.5 text-left font-semibold">Evento</th>
              <th className="px-3 py-2.5 text-right font-semibold">Peso</th>
              {/* Revenue */}
              <th className="px-3 py-2.5 text-right font-semibold text-sky-400 border-l border-zinc-700">Target Rev.</th>
              <th className="px-3 py-2.5 text-right font-semibold text-emerald-400">Reality Rev.</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pacing Rev.</th>
              {/* Tráfico & Conversión */}
              <th className="px-3 py-2.5 text-right font-semibold text-sky-400 border-l border-zinc-700">Target Ses.</th>
              <th className="px-3 py-2.5 text-right font-semibold text-emerald-400">Reality Ses.</th>
              <th className="px-3 py-2.5 text-right font-semibold text-emerald-400">Pedidos</th>
              <th className="px-3 py-2.5 text-right font-semibold text-orange-400">CR Real</th>
              <th className="px-3 py-2.5 text-right font-semibold text-orange-400">AOV Real</th>
              {/* Spend */}
              <th className="px-3 py-2.5 text-right font-semibold text-sky-400 border-l border-zinc-700">Target Spend</th>
              <th className="px-3 py-2.5 text-right font-semibold text-emerald-400">Reality Spend</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pacing Spend</th>
              {/* MER */}
              <th className="px-3 py-2.5 text-right font-semibold text-violet-400 border-l border-zinc-700">MER Real</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, idx) => {
              const entry = entries[day.date];
              const fromTiendanube = tiendanubeCoverage?.has(day.date) ?? false;
              const isEven = idx % 2 === 0;
              const rowCls = clsx(
                "border-t border-zinc-800 transition-colors",
                day.isToday
                  ? "bg-sky-950 ring-1 ring-inset ring-sky-700"
                  : isEven ? "bg-zinc-900" : "bg-zinc-950",
                "hover:bg-zinc-800/60"
              );

              return (
                <tr key={day.date} className={rowCls}>
                  {/* Fecha */}
                  <td className="px-3 py-1.5 whitespace-nowrap font-mono text-zinc-300">
                    {day.date}
                    {day.isToday && (
                      <span className="ml-1.5 text-[10px] bg-sky-600 text-white rounded px-1 py-px">HOY</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-400">{day.dayOfWeek}</td>
                  <td className="px-3 py-1.5">
                    {day.eventBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {day.eventBadges.map((label, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${BADGE_COLORS[i % BADGE_COLORS.length]}`}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Peso */}
                  <td className="px-3 py-1.5 text-right w-16">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={entry?.weightOverride ?? day.weight}
                      onChange={(e) => handleWeight(day.date, e.target.value)}
                      className="w-14 bg-transparent border border-transparent rounded px-1 py-0.5 text-xs tabular-nums text-right focus:outline-none focus:border-zinc-600 focus:bg-zinc-800 hover:border-zinc-700 transition-colors text-zinc-300"
                    />
                  </td>
                  {/* Revenue block */}
                  <td className="px-3 py-1.5 text-right tabular-nums text-sky-300 font-medium border-l border-zinc-800">
                    {fmt$(day.targetRevenue)}
                  </td>
                  <td className="px-3 py-1.5 w-28">
                    {fromTiendanube ? (
                      <TiendanubeCell value={day.realityRevenue ?? 0} fmt={(n) => fmt$(n)} />
                    ) : (
                      <EditableCell
                        value={entry?.realityRevenue ?? null}
                        onChange={(v) => onUpdateEntry(day.date, { realityRevenue: v })}
                        placeholder="0"
                        highlight="green"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <PacingBadge ratio={day.pacingRevenue} />
                  </td>
                  {/* Tráfico block */}
                  <td className="px-3 py-1.5 text-right tabular-nums text-sky-300 font-medium border-l border-zinc-800">
                    {day.targetSessions != null ? fmtNum(day.targetSessions) : "—"}
                  </td>
                  <td className="px-3 py-1.5 w-24">
                    <EditableCell
                      value={entry?.realitySessions ?? null}
                      onChange={(v) => onUpdateEntry(day.date, { realitySessions: v })}
                      placeholder="0"
                      highlight="green"
                      step={1}
                    />
                  </td>
                  <td className="px-3 py-1.5 w-24">
                    {fromTiendanube ? (
                      <TiendanubeCell value={day.realityOrders ?? 0} fmt={(n) => fmtNum(n)} />
                    ) : (
                      <EditableCell
                        value={entry?.realityOrders ?? null}
                        onChange={(v) => onUpdateEntry(day.date, { realityOrders: v })}
                        placeholder="0"
                        highlight="green"
                        step={1}
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-orange-300">
                    {fmtCR(day.realCR)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-orange-300">
                    {fmtAOV(day.realAOV)}
                  </td>
                  {/* Spend block */}
                  <td className="px-3 py-1.5 text-right tabular-nums text-sky-300 font-medium border-l border-zinc-800">
                    {fmt$(day.targetSpend)}
                  </td>
                  <td className="px-3 py-1.5 w-28">
                    <EditableCell
                      value={entry?.realitySpend ?? null}
                      onChange={(v) => onUpdateEntry(day.date, { realitySpend: v })}
                      placeholder="0"
                      highlight="green"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <PacingBadge ratio={day.pacingSpend} />
                  </td>
                  {/* MER */}
                  <td className="px-3 py-1.5 text-right tabular-nums text-violet-300 border-l border-zinc-800">
                    {fmtMER(day.realMER)}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Totals */}
          <tfoot>
            <tr className="bg-zinc-800 border-t-2 border-zinc-600 font-semibold text-zinc-200">
              <td className="px-3 py-2.5 text-left text-zinc-400 uppercase tracking-wide text-[10px]" colSpan={4}>
                Totales
              </td>
              <td className="px-3 py-2.5 text-right text-sky-300 border-l border-zinc-600">{fmt$(totals.totalTargetRevenue)}</td>
              <td className="px-3 py-2.5 text-right text-emerald-300">{fmt$(totals.totalRealityRevenue)}</td>
              <td className="px-3 py-2.5 text-right"><PacingBadge ratio={totals.pacingRevenue} /></td>
              <td className="px-3 py-2.5 text-right text-sky-300 border-l border-zinc-600">—</td>
              <td className="px-3 py-2.5 text-right text-emerald-300">{fmtNum(totals.totalRealitySessions)}</td>
              <td className="px-3 py-2.5 text-right text-emerald-300">{fmtNum(totals.totalRealityOrders)}</td>
              <td className="px-3 py-2.5 text-right text-orange-300">{fmtCR(totals.realCR)}</td>
              <td className="px-3 py-2.5 text-right text-orange-300">{fmtAOV(totals.realAOV)}</td>
              <td className="px-3 py-2.5 text-right text-sky-300 border-l border-zinc-600">{fmt$(totals.totalTargetSpend)}</td>
              <td className="px-3 py-2.5 text-right text-emerald-300">{fmt$(totals.totalRealitySpend)}</td>
              <td className="px-3 py-2.5 text-right"><PacingBadge ratio={totals.pacingSpend} /></td>
              <td className="px-3 py-2.5 text-right text-violet-300 border-l border-zinc-600">{fmtMER(totals.realMER)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard
          label="Revenue Acumulado"
          value={fmt$(totals.totalRealityRevenue)}
          sub={`Target: ${fmt$(totals.totalTargetRevenue)}`}
          pacing={totals.pacingRevenue}
        />
        <SummaryCard
          label="Spend Acumulado"
          value={fmt$(totals.totalRealitySpend)}
          sub={`Target: ${fmt$(totals.totalTargetSpend)}`}
          pacing={totals.pacingSpend}
        />
        <SummaryCard
          label="Pacing Revenue"
          value={fmtPct(totals.pacingRevenue)}
          sub="vs target hasta hoy"
          pacing={totals.pacingRevenue}
        />
        <SummaryCard
          label="MER Acumulado"
          value={fmtMER(totals.realMER)}
          sub="Revenue / Spend real"
          accent="violet"
        />
      </div>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  pacing,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  pacing?: number | null;
  accent?: "violet";
}) {
  const pct = pacing != null ? pacing * 100 : null;
  const borderCls =
    accent === "violet" ? "border-violet-700"
    : pct == null       ? "border-zinc-700"
    : pct >= 105        ? "border-emerald-700"
    : pct >= 90         ? "border-yellow-700"
                        : "border-red-700";

  const valueCls =
    accent === "violet" ? "text-violet-300"
    : pct == null       ? "text-zinc-200"
    : pct >= 105        ? "text-emerald-300"
    : pct >= 90         ? "text-yellow-300"
                        : "text-red-300";

  return (
    <div className={clsx("bg-zinc-900 border rounded-xl px-4 py-3", borderCls)}>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <p className={clsx("text-xl font-bold tabular-nums", valueCls)}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}
