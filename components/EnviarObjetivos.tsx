"use client";

import { useEffect, useState } from "react";
import { AppConfig, ComputedDay } from "@/lib/types";
import { buildObjetivos, objetivosToCSV, spreadsheetIdFromUrl } from "@/lib/objetivos";

interface Props {
  config: AppConfig;
  days: ComputedDay[];
  clientName: string;
  spreadsheetUrl: string;
  onSpreadsheetUrlChange: (url: string) => void;
}

type Estado =
  | { tipo: "inactivo" }
  | { tipo: "enviando" }
  | { tipo: "ok"; mensaje: string }
  | { tipo: "error"; mensaje: string };

// Manda los objetivos diarios de la proyección a la pestaña "Objetivos" del spreadsheet del cliente.
// También permite descargarlos como CSV para importarlos a mano.
export default function EnviarObjetivos({ config, days, clientName, spreadsheetUrl, onSpreadsheetUrlChange }: Props) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const [cuenta, setCuenta] = useState<{ configurado: boolean; email: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/objetivos")
      .then((r) => r.json())
      .then(setCuenta)
      .catch(() => setCuenta({ configurado: false, email: null }));
  }, []);

  const mes = new Date(config.year, config.month, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const urlValida = spreadsheetIdFromUrl(spreadsheetUrl) != null;

  async function enviar() {
    setEstado({ tipo: "enviando" });
    try {
      const r = await fetch("/api/objetivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetUrl, filas: buildObjetivos(days, config) }),
      });
      const cuerpo = await r.json();
      if (!r.ok) throw new Error(cuerpo.error ?? `Error ${r.status}`);
      setEstado({ tipo: "ok", mensaje: `Listo: ${cuerpo.filas} días de ${mes} en la pestaña ${cuerpo.hoja} de ${clientName}.` });
    } catch (e) {
      setEstado({ tipo: "error", mensaje: (e as Error).message });
    }
  }

  function descargar() {
    const csv = objetivosToCSV(buildObjetivos(days, config));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `objetivos-${clientName.toLowerCase().replace(/\s+/g, "-")}-${config.year}-${String(config.month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-zinc-200">Mandar objetivos al spreadsheet del cliente</h3>
        <span className="text-[11px] text-zinc-500">Pestaña Objetivos · reemplaza solo {mes}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="spreadsheet-cliente" className="sr-only">URL del spreadsheet del cliente</label>
        <input
          id="spreadsheet-cliente"
          type="url"
          className="input flex-1 min-w-[260px]"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={spreadsheetUrl}
          onChange={(e) => onSpreadsheetUrlChange(e.target.value)}
        />
        <button
          onClick={enviar}
          disabled={!urlValida || estado.tipo === "enviando" || !cuenta?.configurado}
          className="text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          {estado.tipo === "enviando" ? "Enviando…" : "Enviar al spreadsheet"}
        </button>
        <button
          onClick={descargar}
          className="text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
        >
          Descargar CSV
        </button>
      </div>
      {cuenta && !cuenta.configurado && (
        <p className="text-[11px] text-amber-400">
          La app todavía no tiene configurada la cuenta de servicio de Google. Mientras tanto, usá Descargar CSV e importalo en la pestaña Objetivos.
        </p>
      )}
      {cuenta?.configurado && cuenta.email && (
        <p className="text-[11px] text-zinc-500">
          El spreadsheet tiene que estar compartido como Editor con <span className="text-zinc-300 select-all">{cuenta.email}</span>.
        </p>
      )}
      {estado.tipo === "ok" && <p className="text-[11px] text-emerald-400">{estado.mensaje}</p>}
      {estado.tipo === "error" && <p className="text-[11px] text-red-400">{estado.mensaje}</p>}
    </div>
  );
}
