import React from "react";
import { FieldLabel } from "./FieldLabel";

export interface StepperInputProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function StepperInput({ id, label, max, min, onChange, value }: StepperInputProps): JSX.Element {
  const clamp = (nextValue: number): number => Math.max(min, Math.min(max, nextValue));

  return (
    <FieldLabel htmlFor={id} label={label}>
      <div className="grid h-9 grid-cols-[32px_1fr_32px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <button className="text-slate-500 transition hover:bg-white hover:text-slate-900" onClick={() => onChange(clamp(value - 1))} type="button">
          -
        </button>
        <input
          className="min-w-0 border-x border-slate-200 bg-transparent px-2 text-center text-sm font-semibold text-slate-800 outline-none"
          id={id}
          max={max}
          min={min}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          type="number"
          value={value}
        />
        <button className="text-slate-500 transition hover:bg-white hover:text-slate-900" onClick={() => onChange(clamp(value + 1))} type="button">
          +
        </button>
      </div>
    </FieldLabel>
  );
}
