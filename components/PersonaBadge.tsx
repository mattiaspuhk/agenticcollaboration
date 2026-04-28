import { PERSONAS, type PersonaId } from "@/lib/personas";

export function PersonaBadge({
  persona,
  size = "md",
}: {
  persona: PersonaId;
  size?: "sm" | "md";
}) {
  const p = PERSONAS[persona];
  const dim =
    size === "sm" ? "w-6 h-6 text-[10px]" : "w-[30px] h-[30px] text-[11px]";
  const isAgent = persona === "agent";
  return (
    <div
      className={`${dim} rounded-md grid place-items-center font-bold shrink-0 mt-0.5`}
      style={{
        background: isAgent
          ? "linear-gradient(135deg,var(--agent),#7c3aed)"
          : p.colorVar,
        color: isAgent ? "#ffffff" : "#0e0f12",
      }}
      aria-label={p.label}
    >
      {p.initials}
    </div>
  );
}
