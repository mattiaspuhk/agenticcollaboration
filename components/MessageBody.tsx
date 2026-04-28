"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageBody({ children }: { children: string }) {
  return (
    <div className="md mt-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-[15px] font-semibold mt-3 mb-1.5" {...p} />,
          h2: (p) => <h2 className="text-[14px] font-semibold mt-3 mb-1.5" {...p} />,
          h3: (p) => <h3 className="text-[13px] font-semibold mt-2.5 mb-1 uppercase tracking-[0.04em] text-[var(--muted)]" {...p} />,
          p: (p) => <p className="text-[13px] leading-[1.6] my-1.5 text-[var(--foreground)]/90" {...p} />,
          a: (p) => (
            <a
              {...p}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline underline-offset-2 hover:opacity-80"
            />
          ),
          strong: (p) => <strong className="font-semibold text-[var(--foreground)]" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-1.5 space-y-0.5 text-[13px] leading-[1.55] text-[var(--foreground)]/90 marker:text-[var(--muted)]" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5 text-[13px] leading-[1.55] text-[var(--foreground)]/90 marker:text-[var(--muted)]" {...p} />,
          li: (p) => <li className="leading-[1.55]" {...p} />,
          blockquote: (p) => (
            <blockquote
              className="border-l-2 border-[var(--border-strong)] pl-3 my-2 text-[var(--foreground)]/75 italic"
              {...p}
            />
          ),
          hr: () => <hr className="my-3 border-0 border-t border-[var(--border)]" />,
          code: ({ className, children, ...rest }) => {
            const inline = !/language-/.test(className ?? "");
            if (inline) {
              return (
                <code
                  className="font-mono text-[12px] px-[5px] py-[1px] rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className ?? ""} font-mono text-[12px] leading-[1.55]`} {...rest}>
                {children}
              </code>
            );
          },
          pre: (p) => (
            <pre
              className="font-mono text-[12px] leading-[1.55] my-2 p-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] overflow-x-auto whitespace-pre"
              {...p}
            />
          ),
          table: (p) => (
            <div className="my-2 overflow-x-auto">
              <table className="text-[12px] border-collapse w-full" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-[var(--surface-2)]" {...p} />,
          th: (p) => (
            <th
              className="text-left font-semibold border border-[var(--border)] px-2 py-1 text-[11px] uppercase tracking-[0.04em] text-[var(--muted)]"
              {...p}
            />
          ),
          td: (p) => (
            <td
              className="border border-[var(--border)] px-2 py-1 align-top text-[var(--foreground)]/90"
              {...p}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
