import React from "react";

export interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ ariaLabel, onChange, options, value }: SegmentedControlProps<T>): JSX.Element {
  return (
    <div aria-label={ariaLabel} className="inline-grid h-8 w-full grid-flow-col overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={`min-w-0 rounded px-2 text-xs font-semibold transition ${
              selected ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
            }`}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            title={option.title ?? option.label}
            type="button"
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
