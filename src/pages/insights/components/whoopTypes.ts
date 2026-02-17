export interface BodyMetrics {
  recovery?: number;
  strain?: number;
  sleepPerformance?: number;
  hrv?: number;
  restingHR?: number;
  recoveryUpdatedAt?: string;
  hrvUpdatedAt?: string;
  strainUpdatedAt?: string;
  spo2?: number;
  skinTemp?: number;
  respiratoryRate?: number;
  sleepDisturbances?: number;
  stressLevel?: 'Low' | 'Moderate' | 'High' | 'Very High';
}

export interface SleepBreakdown {
  deepSleep: number;
  remSleep: number;
  lightSleep: number;
  awakeDuring?: number;
  totalHours: number;
  efficiency: number;
  wakeTime?: string;
}

export interface DayHistory {
  date: string;
  dayName: string;
  recovery: number;
  strain: number;
  sleepHours: number;
  hrv: number;
}
