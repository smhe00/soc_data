export type ProjectPhase = "Architecture Planning" | "Pre-Study" | "Design" | "Review" | "Released";

export interface Project {
  id: string;
  name: string;
  product_family: string;
  generation: string;
  phase: ProjectPhase;
  owner: string;
  description: string;
  created_at: string;
  updated_at: string;
}
