import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  jsonb,
  customType,
  index,
} from "drizzle-orm/pg-core";

const EMBED_DIM = 1024;

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBED_DIM})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return JSON.parse(value);
  },
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  docsPaths: jsonb("docs_paths").$type<string[]>().default([]).notNull(),
  status: text("status", {
    enum: ["new", "indexing", "ready", "error"],
  })
    .notNull()
    .default("new"),
  ingestProgress: jsonb("ingest_progress")
    .$type<IngestProgress>()
    .default(emptyProgress())
    .notNull(),
  ingestError: text("ingest_error"),
  ingestStartedAt: timestamp("ingest_started_at"),
  ingestFinishedAt: timestamp("ingest_finished_at"),
  facts: jsonb("facts").$type<ProjectFacts | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProjectFacts = {
  name?: string;
  description?: string;
  languages: string[];
  runtime?: string;
  packageManager?: string;
  frameworks: string[];
  orm?: string;
  database?: string;
  testing: string[];
  linting: string[];
  styling: string[];
  keyConfigs: string[];
  topLevelDirs: string[];
  notes: string[];
  detectedAt: string;
};

export type IngestProgress = {
  stage:
    | "idle"
    | "scanning_code"
    | "embedding_code"
    | "scanning_docs"
    | "embedding_docs"
    | "reading_git"
    | "embedding_git"
    | "done";
  codeFilesSeen: number;
  codeChunks: number;
  codeChunksEmbedded: number;
  docFiles: number;
  docChunks: number;
  docChunksEmbedded: number;
  commits: number;
  commitsEmbedded: number;
};

function emptyProgress(): IngestProgress {
  return {
    stage: "idle",
    codeFilesSeen: 0,
    codeChunks: 0,
    codeChunksEmbedded: 0,
    docFiles: 0,
    docChunks: 0,
    docChunksEmbedded: 0,
    commits: 0,
    commitsEmbedded: 0,
  };
}

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("channels_project_idx").on(t.projectId, t.name)],
);

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .references(() => channels.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("threads_channel_idx").on(t.channelId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").references(() => threads.id, {
      onDelete: "cascade",
    }),
    threadKind: text("thread_kind", {
      enum: ["thread", "discussion", "feature"],
    })
      .notNull()
      .default("thread"),
    containerId: uuid("container_id"),
    authorKind: text("author_kind", {
      enum: ["user", "agent", "system"],
    }).notNull(),
    authorPersona: text("author_persona", {
      enum: ["pm", "engineer", "designer", "agent", "system", "user"],
    }).notNull(),
    authorLabel: text("author_label").notNull(),
    agentRole: text("agent_role"),
    audienceMode: text("audience_mode", {
      enum: ["pm", "engineer", "designer"],
    }),
    bodyMd: text("body_md").notNull(),
    blocks: jsonb("blocks").$type<MessageBlock[]>().default([]).notNull(),
    embedding: vector("embedding"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("messages_thread_idx").on(t.threadId, t.createdAt),
    index("messages_container_idx").on(
      t.threadKind,
      t.containerId,
      t.createdAt,
    ),
  ],
);

export type MessageBlock =
  | { type: "edit_card"; editId: string }
  | {
      type: "commit_ref";
      commitId: string;
      sha: string;
      author: string;
      summary: string;
    }
  | { type: "signal_card"; signals: SignalRef[] }
  | { type: "file_ref"; path: string; lineStart?: number; lineEnd?: number };

export type SignalRef = {
  source: "feedback" | "errors" | "chat_history";
  id: string;
  label: string;
  occurredAt: string;
};

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["todo", "in_progress", "in_review", "done"],
    }).notNull(),
    assignee: text("assignee"),
    description: text("description").notNull().default(""),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<string[]>()
      .default([])
      .notNull(),
    fileRefs: jsonb("file_refs").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("tasks_project_external_idx").on(t.projectId, t.externalId)],
);

export type ProposedEditDiff = {
  rationale: string;
  changes: Array<{
    field: "title" | "description" | "acceptance_criteria" | "file_refs";
    oldValue: unknown;
    newValue: unknown;
  }>;
  attachedQuote?: string;
  fileRefs?: string[];
};

export const proposedEdits = pgTable(
  "proposed_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .references(() => tasks.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    diff: jsonb("diff").$type<ProposedEditDiff>().notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected"],
    })
      .notNull()
      .default("pending"),
    decidedAt: timestamp("decided_at"),
    decidedBy: text("decided_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("edits_task_idx").on(t.taskId)],
);

export const codeChunks = pgTable(
  "code_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    filePath: text("file_path").notNull(),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding").notNull(),
  },
  (t) => [
    index("code_chunks_project_file_idx").on(t.projectId, t.filePath),
  ],
);

export const docChunks = pgTable(
  "doc_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    filePath: text("file_path").notNull(),
    section: text("section").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding").notNull(),
  },
  (t) => [index("doc_chunks_project_idx").on(t.projectId)],
);

export const commits = pgTable(
  "commits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    sha: text("sha").notNull(),
    author: text("author").notNull(),
    committedAt: timestamp("committed_at").notNull(),
    message: text("message").notNull(),
    summary: text("summary").notNull(),
    filePaths: jsonb("file_paths").$type<string[]>().default([]).notNull(),
    prNumber: integer("pr_number"),
    embedding: vector("embedding").notNull(),
  },
  (t) => [
    index("commits_project_committed_idx").on(t.projectId, t.committedAt),
    index("commits_project_sha_idx").on(t.projectId, t.sha),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    customer: text("customer").notNull(),
    content: text("content").notNull(),
    featureTags: jsonb("feature_tags").$type<string[]>().default([]).notNull(),
    receivedAt: timestamp("received_at").notNull(),
    embedding: vector("embedding").notNull(),
  },
  (t) => [index("feedback_project_idx").on(t.projectId)],
);

export const errors = pgTable(
  "errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    message: text("message").notNull(),
    filePath: text("file_path"),
    line: integer("line"),
    firstSeen: timestamp("first_seen").notNull(),
    lastSeen: timestamp("last_seen").notNull(),
    count: integer("count").notNull().default(1),
    embedding: vector("embedding").notNull(),
  },
  (t) => [index("errors_project_idx").on(t.projectId)],
);

export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    state: text("state", {
      enum: ["open", "graduated", "dropped"],
    })
      .notNull()
      .default("open"),
    graduatedToFeatureId: uuid("graduated_to_feature_id"),
    graduatedAt: timestamp("graduated_at"),
    droppedAt: timestamp("dropped_at"),
    droppedReason: text("dropped_reason"),
    framingState: jsonb("framing_state")
      .$type<FramingState>()
      .default({ converged: false })
      .notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("discussions_project_idx").on(t.projectId, t.createdAt)],
);

export type FramingCriteria = {
  specificUser: boolean;
  specificWorkflow: boolean;
  expectationGap: boolean;
  concreteSignal: boolean;
  falsifiable: boolean;
};

export type FramingState = {
  converged: boolean;
  criteria?: FramingCriteria;
  suggestedTitle?: string;
  reason?: string;
  checkedAt?: string;
};

export type DiscoveryDigest = {
  framedProblem: string;
  keyContext: string[];
  sourceQuotes: string[];
};

export const features = pgTable(
  "features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", {
      enum: ["scoping", "in_progress", "blocked", "in_review", "shipped"],
    })
      .notNull()
      .default("scoping"),
    statusNote: text("status_note").notNull().default(""),
    branchName: text("branch_name"),
    githubRepo: text("github_repo"),
    blockers: jsonb("blockers").$type<FeatureBlocker[]>().default([]).notNull(),
    linkedPrIds: jsonb("linked_pr_ids")
      .$type<LinkedPr[]>()
      .default([])
      .notNull(),
    sourceDiscussionId: uuid("source_discussion_id"),
    discoveryDigest: jsonb("discovery_digest").$type<DiscoveryDigest | null>(),
    lastAgentSummaryAt: timestamp("last_agent_summary_at"),
    lastGithubPollAt: timestamp("last_github_poll_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("features_project_idx").on(t.projectId, t.createdAt),
    index("features_slug_idx").on(t.projectId, t.slug),
  ],
);

export type FeatureBlocker = {
  id: string;
  body: string;
  createdAt: string;
};

export type LinkedPr = {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  url: string;
  mergedAt?: string;
  updatedAt: string;
};

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .references(() => features.id, { onDelete: "cascade" })
      .notNull(),
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at"),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("decisions_feature_idx").on(t.featureId, t.createdAt)],
);

export const featureSignals = pgTable(
  "feature_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureId: uuid("feature_id")
      .references(() => features.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role", {
      enum: ["pm", "eng", "user", "all"],
    }).notNull(),
    tileKind: text("tile_kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
  },
  (t) => [
    index("feature_signals_feature_idx").on(
      t.featureId,
      t.role,
      t.tileKind,
    ),
  ],
);

export const chatHistory = pgTable(
  "chat_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    channel: text("channel").notNull(),
    author: text("author").notNull(),
    content: text("content").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    embedding: vector("embedding").notNull(),
  },
  (t) => [index("chat_history_project_idx").on(t.projectId)],
);
