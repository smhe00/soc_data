import React from "react";

export interface AreaTripletProps {
  logic: number;
  sram: number;
  block: number;
  compact?: boolean;
}

export function AreaTriplet({ logic, sram, block, compact = false }: AreaTripletProps): JSX.Element {
  const numberClass = compact ? "text-base font-semibold text-slate-950" : "text-2xl font-semibold text-slate-950";
  const labelClass = compact ? "text-[11px] text-slate-500" : "text-xs text-slate-500";
  return (
    <div className={compact ? "mt-2 grid grid-cols-3 gap-2" : "mt-3 flex items-end gap-6"}>
      <div>
        <div className={numberClass}>{logic}</div>
        <div className={labelClass}>logic mm²</div>
      </div>
      <div>
        <div className={numberClass}>{sram}</div>
        <div className={labelClass}>SRAM mm²</div>
      </div>
      <div>
        <div className={numberClass}>{block}</div>
        <div className={labelClass}>block mm²</div>
      </div>
    </div>
  );
}
