export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Mon ... 6=Sun

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
}

export interface MonthCurve {
  early: number;  // días 1-10
  mid: number;    // días 11-20
  late: number;   // días 21-fin
}

export interface AppConfig {
  month: number; // 0-11
  year: number;
  targetRevenue: number;
  targetMER: number;
  guideAOV: number;
  guideCR: number;
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
