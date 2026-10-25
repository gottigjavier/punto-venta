import { isoFromParts } from "./isoDate";

export const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const WEEKDAY_LABELS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

export const monthLabel = (year: number, month: number) =>
  `${MONTHS_ES[month - 1]} de ${year}`;

export const shiftMonth = (year: number, month: number, delta: number) => {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: ((index % 12) + 12) % 12 + 1,
  };
};

export const buildMonthGrid = (year: number, month: number) => {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    const cellYear = date.getUTCFullYear();
    const cellMonth = date.getUTCMonth() + 1;
    const cellDay = date.getUTCDate();
    cells.push({
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      iso: isoFromParts(cellYear, cellMonth, cellDay),
      inMonth: cellMonth === month && cellYear === year,
    });
  }
  return cells;
};

export const localTodayIso = () => {
  const now = new Date();
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
};
