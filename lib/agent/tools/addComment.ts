import type { ToolHandler } from "./index";

export const addComment: ToolHandler = async (args) => {
  const body = String(args.body ?? "").trim();
  if (!body) return { text: "add_comment: empty body" };
  return { text: `Comment recorded: ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}` };
};
