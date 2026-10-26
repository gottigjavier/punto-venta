import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMonthGrid,
  localTodayIso,
  MONTHS_ES,
  monthLabel,
  shiftMonth,
  WEEKDAY_LABELS,
} from "@/lib/calendar";
import { isoFromParts, parseIso } from "@/lib/isoDate";

const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const mondayIndexOf = (iso: string) => (weekdayOf(iso) + 6) % 7;

const sameDayShiftedMonths = (iso: string, delta: number) => {
  const parts = parseIso(iso) || parseIso(localTodayIso());
  if (!parts) return iso;
  const year = parts.year ?? new Date().getUTCFullYear();
  const month = parts.month ?? new Date().getUTCMonth() + 1;
  const moved = shiftMonth(year, month, delta);
  const lastDay = new Date(Date.UTC(moved.year, moved.month, 0)).getUTCDate();
  const day = parts.day ?? new Date().getUTCDate();
  return isoFromParts(moved.year, moved.month, Math.min(day, lastDay));
};

interface CalendarPopoverProps {
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}

export default function CalendarPopover({
  value,
  onSelect,
  onClose,
}: CalendarPopoverProps) {
  const today = useMemo(() => localTodayIso(), []);
  const selected = parseIso(value) ? value : "";
  const initial = selected || today;

  const [view, setView] = useState(() => {
    const base = parseIso(initial);
    return base ? { year: base.year, month: base.month } : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  });
  const [focusedIso, setFocusedIso] = useState(initial);
  const gridRef = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => buildMonthGrid(view.year, view.month), [view]);

  useEffect(() => {
    const node = gridRef.current && gridRef.current.querySelector(`[data-iso=\"${focusedIso}\"]`);
    if (node) (node as HTMLElement).focus();
  }, [focusedIso, view]);

  const goTo = (iso: string) => {
    setFocusedIso(iso);
    const parts = parseIso(iso);
    if (!parts) return;
    setView((current) =>
      current.year === parts.year && current.month === parts.month
        ? current
        : { year: parts.year, month: parts.month }
    );
  };

  const move = (days: number) => goTo(addDays(focusedIso, days));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      ArrowUp: () => move(-7),
      ArrowDown: () => move(7),
      Home: () => goTo(addDays(focusedIso, -mondayIndexOf(focusedIso))),
      End: () => goTo(addDays(focusedIso, 6 - mondayIndexOf(focusedIso))),
      PageUp: () => goTo(sameDayShiftedMonths(focusedIso, -1)),
      PageDown: () => goTo(sameDayShiftedMonths(focusedIso, 1)),
    };
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div
      className="df-pop"
      role="dialog"
      aria-label="Calendario"
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="df-pop-head">
        <button
          type="button"
          className="df-nav"
          aria-label="Año anterior"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            goTo(sameDayShiftedMonths(focusedIso, -12));
          }}
        >
          «
        </button>
        <button
          type="button"
          className="df-nav"
          aria-label="Mes anterior"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            goTo(sameDayShiftedMonths(focusedIso, -1));
          }}
        >
          ‹
        </button>
        <span className="df-pop-title">{monthLabel(view.year, view.month)}</span>
        <button
          type="button"
          className="df-nav"
          aria-label="Mes siguiente"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            goTo(sameDayShiftedMonths(focusedIso, 1));
          }}
        >
          ›
        </button>
        <button
          type="button"
          className="df-nav"
          aria-label="Año siguiente"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            goTo(sameDayShiftedMonths(focusedIso, 12));
          }}
        >
          »
        </button>
      </div>

      <div className="df-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="df-weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="df-grid" ref={gridRef}>
        {cells.map((cell) => {
          const isSelected = selected === cell.iso;
          const isToday = today === cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              className={`df-day ${cell.inMonth ? "" : "df-day--out"} ${isSelected ? "df-day--sel" : ""} ${isToday ? "df-day--today" : ""}`}
              data-iso={cell.iso}
              tabIndex={focusedIso === cell.iso ? 0 : -1}
              aria-label={`${cell.day} de ${MONTHS_ES[cell.month - 1]} de ${cell.year}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(cell.iso);
              }}
              onFocus={() => setFocusedIso(cell.iso)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
