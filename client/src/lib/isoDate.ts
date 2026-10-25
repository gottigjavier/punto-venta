/**
 * Display <-> ISO boundary for editable date fields.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const isRealDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
};

export const parseIso = (iso: unknown): { year: number; month: number; day: number } | null => {
  const found = ISO_DATE.exec(String(iso ?? "").trim());
  if (!found) return null;
  const year = Number(found[1]);
  const month = Number(found[2]);
  const day = Number(found[3]);
  if (!isRealDate(year, month, day)) return null;
  return { year, month, day };
};

export const isoFromParts = (year: number, month: number, day: number): string => {
  if (!isRealDate(year, month, day)) return "";
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const isoToDisplay = (iso: unknown): string => {
  const parts = parseIso(iso);
  if (!parts) return "";
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${d}/${m}/${parts.year}`;
};

export const displayToIso = (text: unknown): string | null => {
  const found = DISPLAY_DATE.exec(String(text ?? "").trim());
  if (!found) return null;
  const day = Number(found[1]);
  const month = Number(found[2]);
  const year = Number(found[3]);
  if (!isRealDate(year, month, day)) return null;
  return `${found[3]}-${found[2]}-${found[1]}`;
};

export const maskDateInput = (text: unknown): string => {
  const digits = String(text ?? "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};
