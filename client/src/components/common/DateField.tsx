import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { displayToIso, isoToDisplay, maskDateInput } from "@/lib/isoDate";
import CalendarPopover from "./CalendarPopover";
import "./DateField.css";

export default function DateField({
  id,
  name,
  className,
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  disabled,
  required,
  title,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, minWidth: 0 });
  const fieldRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canonical = value || "";
    setText((prev) => {
      const prevIso = displayToIso(prev);
      if (prevIso !== null && prevIso === canonical) return prev;
      if (canonical === "" && prevIso === null) return prev;
      return isoToDisplay(canonical);
    });
  }, [value]);

  const place = () => {
    const field = fieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const pop = popRef.current;
    const height = pop ? pop.offsetHeight : 280;
    const width = pop ? pop.offsetWidth : rect.width;
    const margin = 4;
    let top = rect.bottom + margin;
    if (top + height > window.innerHeight && rect.top - margin - height >= 0) {
      top = rect.top - margin - height;
    }
    let left = rect.left;
    const maxLeft = window.innerWidth - width - margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    setCoords({ top, left, minWidth: rect.width });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onScrollOrResize = () => place();
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event: MouseEvent) => {
      if (fieldRef.current && fieldRef.current.contains(event.target as Node)) return;
      if (popRef.current && popRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [open]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDateInput(event.target.value);
    setText(masked);
    const iso = displayToIso(masked);
    if (iso !== null) {
      onChange(iso);
    } else if (masked === "") {
      onChange("");
    }
  };

  const handleBlur = () => {
    const iso = displayToIso(text);
    if (iso !== null) {
      setText(isoToDisplay(iso));
      return;
    }
    const fallback = isoToDisplay(value);
    setText(fallback);
    if (fallback === "") {
      onChange("");
    }
  };

  const selectDay = (iso: string) => {
    onChange(iso);
    setOpen(false);
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <span className="df-field" ref={fieldRef}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        className={className}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        required={required}
        title={title}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="df-btn"
        aria-label={open ? "Cerrar calendario" : "Abrir calendario"}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <rect
            x="1.5"
            y="2.5"
            width="13"
            height="12"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line x1="1.5" y1="6" x2="14.5" y2="6" stroke="currentColor" strokeWidth="1.5" />
          <line x1="5" y1="1.5" x2="5" y2="4" stroke="currentColor" strokeWidth="1.5" />
          <line x1="11" y1="1.5" x2="11" y2="4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            className="df-pop-anchor"
            ref={popRef}
            style={{ top: coords.top, left: coords.left, minWidth: coords.minWidth }}
          >
            <CalendarPopover
              value={value || ""}
              onSelect={selectDay}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body
        )}
    </span>
  );
}
