export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Mon ... 6=Sun

// Which two variables are inputs; the third is derived
// revenue_mer   → input: revenue + MER,   derived: spend
// spend_mer     → input: spend + MER,     derived: revenue
// spend_revenue → input: spend + revenue, derived: MER
export type ProjectionMode = "revenue_mer" | "spend_mer" | "spend_revenue";

export type WeightMode = "manual" | "auto";

export type Weights7 = [number, number, number, number, number, number, number];

export interface AutoWeightMeta {
  rowCount: number;
  monthCount: number;
  dateFrom: string;
  dateTo: string;
  // "tiendanube" = parser específico (dedup por orden + filtro de pago) con blend
  // estacional/reciente 70/30; "generic" = detección de columnas por keyword,
  // una sola ventana (comportamiento histórico de autoWeights.ts).
  source?: "tiendanube" | "generic";
  seasonalDays?: number;
  recentDays?: number;
}

// Serie diaria de ventas ya limpia (una fila = un pedido, sin duplicar por línea
// de producto). La produce lib/tiendanube.ts y la consume lib/blendEngine.ts.
export interface DailyMetric {
  date: string; // YYYY-MM-DD
  revenue: number;
  pedidos: number;
}

export interface ClientMeta {
  id: string;
  name: string;
}

export interface ProjectionMeta {
  id: string;
  name: string;
}

export interface SpecialEvent {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  weight: number; // always added to composed base weight
  // MER esperado ESE día (no un multiplicador). Si se carga, el presupuesto de
  // Spend del mes se reparte distinto ese día (ver calc.ts::computeDays) — el
  // total del mes sigue dando targetMER, pero el MER día a día pasa a variar.
  mer?: number;
}

export interface MonthCurve {
  early: number;  // días 1-10
  mid: number;    // días 11-20
  late: number;   // días 21-fin
}

export interface AppConfig {
  month: number; // 0-11
  year: number;
  projectionMode: ProjectionMode;
  targetRevenue: number;
  targetMER: number;
  targetSpend: number;
  guideAOV: number;
  guideCR: number;
  weightMode: WeightMode;
  autoWeightsMeta: AutoWeightMeta | null;
  // index 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
  dayWeights: [number, number, number, number, number, number, number];
  monthCurve: MonthCurve;
  specialEvents: SpecialEvent[];
}

export interface DayEntry {
  date: string; // YYYY-MM-DD
  weightOverride: number | null;
  realityRevenue: number | null;
  realitySpend: number | null;
  realitySessions: number | null;
  realityOrders: number | null;
}

export interface ComputedDay {
  date: string;
  dayOfWeek: string;
  eventLabel: string;   // concatenated — used for CSV export
  eventBadges: string[]; // individual labels — used for UI badges
  weight: number;
  targetRevenue: number;
  targetSpend: number;
  targetSessions: number | null;
  realityRevenue: number | null;
  realitySpend: number | null;
  realitySessions: number | null;
  realityOrders: number | null;
  pacingRevenue: number | null;
  pacingSpend: number | null;
  realMER: number | null;
  realCR: number | null;
  realAOV: number | null;
  isToday: boolean;
  isPast: boolean;
}
