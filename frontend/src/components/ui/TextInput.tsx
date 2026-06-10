import React from "react";

export interface TextInputProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function TextInput({ ariaLabel, id, value, onChange }: TextInputProps): JSX.Element {
  return (
    <input
      aria-label={ariaLabel}
      className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
      id={id}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}
