import { apiGet, apiJson } from "./client";
import type { ImplOption } from "../types/impl_option";

export function getImplOptions(): Promise<ImplOption[]> {
  return apiGet<ImplOption[]>("/api/impl-options");
}

export interface ImplOptionDetailPayload {
  implementation_type: string;
  status?: string;
  tiers: Array<{
    id: string;
    name: string;
    process: string;
    role: string;
    thickness_um: number;
  }>;
  interfaces: Array<{
    id: string;
    from_tier_id: string;
    to_tier_id: string;
    orientation: string;
    interconnect: string;
    hb_pitch_um: number;
    upper_tsv_pitch_um: number;
    upper_tsv_keepout_um: number;
    lower_tsv_pitch_um: number;
    lower_tsv_keepout_um: number;
    description: string;
  }>;
  package_escape: {
    bottom_tier_id: string;
    requires_tsv: boolean;
    pitch_um: number;
    keepout_um: number;
    description: string;
  };
}

export interface ImplOptionDetailResponse extends ImplOptionDetailPayload {
  exists: boolean;
  impl_option_id: string;
  status: string;
  version: number;
  updated_at: string;
}

export function getImplOptionDetail(implOptionId: string): Promise<ImplOptionDetailResponse> {
  return apiGet<ImplOptionDetailResponse>(`/api/impl-options/${encodeURIComponent(implOptionId)}/detail`);
}

export function updateImplOptionDetail(implOptionId: string, payload: ImplOptionDetailPayload): Promise<{ implementation: ImplOptionDetailResponse }> {
  return apiJson<{ implementation: ImplOptionDetailResponse }>(`/api/impl-options/${encodeURIComponent(implOptionId)}/detail`, "PUT", payload);
}
