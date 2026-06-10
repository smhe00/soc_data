import React from "react";

export interface FieldLabelProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export function FieldLabel({ label, htmlFor, children }: FieldLabelProps): JSX.Element {
  return (
    <label className="grid gap-1" htmlFor={htmlFor}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
