import React from "react";

export interface UnitNumberInputProps {
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
  unit: string;
  disabled?: boolean;
  id?: string;
  min?: number;
  max?: number;
  step?: number | string;
  tone?: "slate" | "amber";
}

export function UnitNumberInput({
  ariaLabel,
  disabled = false,
  id,
  max,
  min,
  onChange,
  step = "0.1",
  tone = "slate",
  unit,
  value,
}: UnitNumberInputProps): JSX.Element {
  const toneClass = tone === "amber" ? "border-amber-200 bg-amber-50/70 focus-within:border-amber-300" : "border-slate-200 bg-slate-50 focus-within:border-slate-400";

  return (
    <div
      className={`flex h-8 items-center overflow-hidden rounded-md border transition focus-within:bg-white focus-within:ring-2 ${
        tone === "amber" ? "focus-within:ring-amber-100" : "focus-within:ring-slate-200"
      } ${disabled ? "bg-slate-100 text-slate-400" : toneClass}`}
    >
      <input
        aria-label={ariaLabel}
        className="numeric-input h-full min-w-0 flex-1 border-0 bg-transparent px-1.5 text-right text-sm font-medium outline-none disabled:text-slate-400"
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
      <span className="border-l border-inherit px-1.5 text-[10px] font-semibold uppercase text-slate-400">{unit}</span>
    </div>
  );
}
