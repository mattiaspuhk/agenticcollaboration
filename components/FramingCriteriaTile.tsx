"use client";

import type { FramingCriteria, FramingState } from "@/db/schema";

const CRITERIA: {
  key: keyof FramingCriteria;
  label: string;
  hint: string;
}[] = [
  {
    key: "specificUser",
    label: "Specific user",
    hint: "A role or segment, not just “users”",
  },
  {
    key: "specificWorkflow",
    label: "Specific workflow",
    hint: "A moment or task, not just “the app”",
  },
  {
    key: "expectationGap",
    label: "Expectation gap",
    hint: "Expected vs. actual, both halves",
  },
  {
    key: "concreteSignal",
    label: "Concrete signal",
    hint: "Quote, ticket, count, or metric",
  },
  {
    key: "falsifiable",
    label: "Falsifiable",
    hint: "A finding could kill it",
  },
];

const EMPTY: FramingCriteria = {
  specificUser: false,
  specificWorkflow: false,
  expectationGap: false,
  concreteSignal: false,
  falsifiable: false,
};

export function FramingCriteriaTile({ framing }: { framing: FramingState }) {
  const criteria = framing?.criteria ?? EMPTY;
  const passed = CRITERIA.filter((c) => criteria[c.key]).length;
  const converged = framing?.converged === true;

  return (
    <div
      className="mx-[18px] mt-3 mb-1 rounded-lg border bg-[var(--surface)]"
      style={{
        borderColor: converged
          ? "color-mix(in srgb,var(--ok) 35%,var(--border))"
          : "var(--border)",
      }}
    >
      <header className="flex items-center gap-2 px-3.5 py-2 border-b border-[var(--border)]">
        <h3 className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">
          Framing criteria
        </h3>
        <span
          className="text-[10px] font-semibold px-1.5 py-px rounded border"
          style={{
            color: converged ? "var(--ok)" : "var(--muted)",
            borderColor: converged
              ? "color-mix(in srgb,var(--ok) 40%,transparent)"
              : "var(--border)",
            background: converged
              ? "color-mix(in srgb,var(--ok) 10%,transparent)"
              : "var(--surface-2)",
          }}
        >
          {passed}/5
        </span>
        <span className="ml-auto text-[11px] text-[var(--muted)] truncate">
          {converged
            ? "Converged — ready to graduate"
            : framing?.reason || "Pressure-test the framing"}
        </span>
      </header>
      <ul className="px-3.5 py-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-2">
        {CRITERIA.map((c) => {
          const on = !!criteria[c.key];
          return (
            <li
              key={c.key}
              className="flex items-start gap-2 min-w-0"
              title={c.hint}
            >
              <CheckMark on={on} />
              <div className="min-w-0">
                <div
                  className={`text-[12px] font-medium leading-tight ${
                    on
                      ? "text-[var(--foreground)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {c.label}
                </div>
                <div className="text-[10.5px] text-[var(--muted-2)] leading-tight mt-0.5 truncate">
                  {c.hint}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CheckMark({ on }: { on: boolean }) {
  if (on) {
    return (
      <span
        className="shrink-0 mt-[1px] w-[14px] h-[14px] rounded-[3px] flex items-center justify-center"
        style={{
          background: "var(--ok)",
          color: "white",
        }}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1.5 5.5L4 8L8.5 2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="shrink-0 mt-[1px] w-[14px] h-[14px] rounded-[3px] border"
      style={{
        borderColor: "var(--border-strong)",
        background: "var(--surface-2)",
      }}
    />
  );
}
