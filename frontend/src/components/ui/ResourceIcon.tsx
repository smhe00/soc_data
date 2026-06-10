import React from "react";
import { Cpu, MemoryStick, RadioTower, Boxes } from "lucide-react";

export interface ResourceIconProps {
  resource: string;
}

export function ResourceIcon({ resource }: ResourceIconProps): JSX.Element {
  if (resource.includes("memory")) return <MemoryStick size={16} />;
  if (resource.includes("phy")) return <RadioTower size={16} />;
  if (resource.includes("logic")) return <Cpu size={16} />;
  return <Boxes size={16} />;
}
