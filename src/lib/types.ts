export type Unit = "mg" | "ml" | "tablet" | "capsule" | "drop" | "other";

export const UNITS: readonly Unit[] = ["tablet", "capsule", "mg", "ml", "drop", "other"];

export type FrequencyType = "daily" | "specificDays" | "interval";

export type Frequency = {
  type: FrequencyType;
  /** 0 = domingo … 6 = sábado (igual a Date.getDay()). */
  days?: number[];
  intervalDays?: number;
  /** Data local "YYYY-MM-DD" a partir da qual o intervalo é contado. */
  startDate?: string;
};

/** Origem da informação sobre o medicamento. */
export type InfoSource = "infarmed" | "leaflet" | "box" | "manual";

export type InfarmedLink = {
  matched: boolean;
  recordId?: string;
  recordUrl?: string;
  leafletUrl?: string;
  spcUrl?: string;
  retrievedAt?: string;
  rawData?: unknown;
};

export type MedicalInfo = {
  purpose?: string[];
  howToTake?: string[];
  missedDose?: string[];
  sideEffects?: string[];
  warnings?: string[];
  storage?: string[];
  source: InfoSource;
  lastReviewedAt: string;
};

export const MEDICAL_INFO_SECTIONS = [
  "purpose",
  "howToTake",
  "missedDose",
  "sideEffects",
  "warnings",
  "storage",
] as const;
export type MedicalInfoSection = (typeof MEDICAL_INFO_SECTIONS)[number];

/** Texto lido da caixa por OCR — guardado à parte, nunca misturado com dados oficiais. */
export type OcrExtract = {
  rawText: string;
  name?: string;
  activeSubstance?: string;
  strength?: string;
  form?: string;
  packCount?: string;
  expiry?: string;
  manufacturer?: string;
  /** EAN-13 do código de barras (ou dos números por baixo dele). */
  ean?: string;
  capturedAt: string;
};

export type Medication = {
  id: string;
  name: string;
  activeSubstance?: string;
  /** Dosagem/força, ex.: "500 mg". */
  dosage: string;
  unit: Unit;
  quantityPerDose: number;
  frequency: Frequency;
  /** Horas locais "HH:mm". */
  times: string[];
  /** Indicações do médico (ex.: "depois do pequeno-almoço"). */
  instructions?: string;
  notes?: string;
  color?: string;
  pharmaceuticalForm?: string;
  /** EAN-13 da embalagem, para reconhecer a caixa noutra fotografia. */
  ean?: string;
  infarmed?: InfarmedLink;
  medicalInfo?: MedicalInfo;
  ocr?: OcrExtract;
  createdAt: string;
  updatedAt: string;
};

export type DoseStatus = "pending" | "taken" | "skipped" | "snoozed";

export type DoseLog = {
  /** Determinístico: `${medicationId}|${scheduledFor}`. */
  id: string;
  medicationId: string;
  /** Data e hora local "YYYY-MM-DDTHH:mm". */
  scheduledFor: string;
  takenAt?: string;
  snoozedUntil?: string;
  status: DoseStatus;
  /** Quando o registo foi alterado (ISO), para juntar cópias sincronizadas. */
  updatedAt?: string;
};

/** Registo do INFOMED guardado em cache local, com data de obtenção. */
export type InfarmedRecord = {
  /** med_guid do INFOMED quando conhecido; caso contrário um id local. */
  id: string;
  name: string;
  activeSubstance?: string;
  pharmaceuticalForm?: string;
  strength?: string;
  authorisationStatus?: string;
  holder?: string;
  ean?: string;
  recordUrl?: string;
  leafletUrl?: string;
  spcUrl?: string;
  /** Como o registo foi obtido: por um fornecedor automático, ou copiado pelo utilizador da página oficial. */
  origin: "provider" | "user-copied";
  retrievedAt: string;
  nameLower: string;
  substanceLower: string;
  rawData?: unknown;
};

export type TextSize = "normal" | "large" | "xlarge";
export type Locale = "pt" | "zh";
