export type PersonaId =
  | "pm"
  | "engineer"
  | "designer"
  | "agent"
  | "system"
  | "user";

export type Persona = {
  id: PersonaId;
  label: string;
  initials: string;
  colorVar: string;
};

export const PERSONAS: Record<PersonaId, Persona> = {
  pm: {
    id: "pm",
    label: "Sam (PM)",
    initials: "SP",
    colorVar: "var(--color-pm)",
  },
  engineer: {
    id: "engineer",
    label: "Daniel (Eng)",
    initials: "DE",
    colorVar: "var(--color-eng)",
  },
  designer: {
    id: "designer",
    label: "Riley (Design)",
    initials: "RD",
    colorVar: "var(--color-design)",
  },
  agent: {
    id: "agent",
    label: "Agent",
    initials: "AI",
    colorVar: "var(--color-agent)",
  },
  system: {
    id: "system",
    label: "System",
    initials: "··",
    colorVar: "var(--color-muted)",
  },
  user: {
    id: "user",
    label: "End user",
    initials: "U",
    colorVar: "var(--color-design)",
  },
};

export const POSTABLE_PERSONAS: PersonaId[] = ["pm", "engineer", "designer"];
