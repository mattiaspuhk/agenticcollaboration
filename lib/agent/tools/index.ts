import type Anthropic from "@anthropic-ai/sdk";
import { searchCodebase } from "./searchCodebase";
import { searchDocs } from "./searchDocs";
import { listActiveTasks } from "./listActiveTasks";
import { readTask } from "./readTask";
import { proposeTaskEdit } from "./proposeTaskEdit";
import { addComment } from "./addComment";
import { searchGitHistory } from "./searchGitHistory";
import { searchSignals } from "./searchSignals";
import { searchThreads } from "./searchThreads";

export type ToolContext = {
  threadId: string;
  projectId: string;
  agentMessageId: string;
};

export type ToolResult = {
  text: string;
  blocks?: import("@/db/schema").MessageBlock[];
};

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

export const TOOL_DEFS: Anthropic.Messages.Tool[] = [
  {
    name: "search_codebase",
    description:
      "Vector search over the indexed codebase. Returns matching code chunks with file paths and line numbers. Use this when the user mentions code, a feature, a file, a bug location, or anything that might live in the source tree.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language query, e.g. '2FA setup flow', 'token refresh on slow networks'",
        },
        limit: {
          type: "integer",
          description: "Max results to return (default 6, max 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_docs",
    description:
      "Vector search over indexed product/engineering docs (markdown). Use for product context, design decisions, onboarding flows.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_active_tasks",
    description:
      "List active engineering tasks (status != done) with title, assignee, status, and a short description.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_task",
    description: "Read full details of a single task by its external_id (e.g. '#42').",
    input_schema: {
      type: "object",
      properties: {
        external_id: { type: "string" },
      },
      required: ["external_id"],
    },
  },
  {
    name: "propose_task_edit",
    description:
      "Propose an edit to an existing task. The edit is NOT applied directly — it's surfaced to the team in the thread as an approve/reject card. Use this when product or engineering context indicates an existing task should change scope, criteria, or attached references.",
    input_schema: {
      type: "object",
      properties: {
        external_id: { type: "string", description: "Task external id, e.g. '#42'" },
        rationale: {
          type: "string",
          description: "One or two sentences explaining why this edit is being proposed.",
        },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                enum: ["title", "description", "acceptance_criteria", "file_refs"],
              },
              new_value: {
                description:
                  "New value for the field. For acceptance_criteria and file_refs, an array of strings. For title and description, a string.",
              },
            },
            required: ["field", "new_value"],
          },
        },
        attached_quote: {
          type: "string",
          description: "Optional customer quote or message excerpt to attach to the edit.",
        },
      },
      required: ["external_id", "rationale", "changes"],
    },
  },
  {
    name: "add_comment",
    description:
      "Post a textual comment to the current thread without proposing a task edit. Use sparingly — this is for short observations, not the main response.",
    input_schema: {
      type: "object",
      properties: {
        body: { type: "string" },
      },
      required: ["body"],
    },
  },
  {
    name: "search_git_history",
    description:
      "Search recent git commits by query (and optionally restrict to file paths). Returns commit sha, author, date, summary, and touched files. Use this BEFORE accepting any claim about what was already fixed or shipped — verify with the actual git history. If a teammate says 'this is the known issue', check whether a recent commit already addresses it.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Optional file path prefixes to filter on, e.g. ['app/auth/']",
        },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_signals",
    description:
      "Search across EXTERNAL product signals: customer feedback, error events (Sentry-style), and imported chat archives (Slack exports etc). NOT for in-app conversations — use search_threads for those. Use search_signals AFTER successfully proposing a task edit to surface patterns: if the same feature has 3+ signals across 2+ sources in the last 30 days, mention it unprompted.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        sources: {
          type: "array",
          items: { type: "string", enum: ["feedback", "errors", "chat_history"] },
          description: "Optional. If omitted, search all three sources.",
        },
        days: { type: "integer", description: "Time window, default 30 days" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_threads",
    description:
      "Vector search over IN-APP conversations (messages this team posted in this app, across all channels and threads in the project). Use this BEFORE making any uniqueness claim like 'this is the first time this has come up', 'no prior discussion', or 'no record of anyone asking'. Also use to surface related threads when the user asks about a topic that may have been discussed elsewhere. By default excludes the current thread; pass include_current_thread:true to include it.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        days: { type: "integer", description: "Time window, default 90 days" },
        limit: { type: "integer", description: "Max results, default 8, max 20" },
        include_current_thread: {
          type: "boolean",
          description:
            "If true, includes messages from the current thread in results. Default false.",
        },
      },
      required: ["query"],
    },
  },
];

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search_codebase: searchCodebase,
  search_docs: searchDocs,
  list_active_tasks: listActiveTasks,
  read_task: readTask,
  propose_task_edit: proposeTaskEdit,
  add_comment: addComment,
  search_git_history: searchGitHistory,
  search_signals: searchSignals,
  search_threads: searchThreads,
};

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { text: `Unknown tool: ${name}` };
  }
  try {
    return await handler(args, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Tool ${name} failed: ${msg}` };
  }
}
