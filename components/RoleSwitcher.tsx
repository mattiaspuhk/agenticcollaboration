"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";
import type { Role } from "@/lib/tiles";

const ROLES: { id: Role; label: string; sub: string }[] = [
  { id: "pm", label: "PM", sub: "shipping signal" },
  { id: "eng", label: "Engineer", sub: "code-level" },
  { id: "user", label: "End user", sub: "what's coming" },
];

const STORAGE_KEY = "feature-role";

export function RoleSwitcher({ role }: { role: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, role);
    }
  }, [role]);

  const setRole = useCallback(
    (next: Role) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("role", next);
      router.replace(`${pathname}?${sp.toString()}`);
      router.refresh();
    },
    [params, pathname, router],
  );

  return (
    <div className="flex items-center gap-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-0.5">
      {ROLES.map((r) => {
        const active = r.id === role;
        return (
          <button
            key={r.id}
            onClick={() => setRole(r.id)}
            className={`px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${
              active
                ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            title={r.sub}
          >
            <span>{r.label}</span>
            {active && (
              <span className="ml-1 text-[9.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                {r.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
