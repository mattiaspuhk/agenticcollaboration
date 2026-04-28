export type Role = "pm" | "eng" | "user";

export type TileVisual =
  | "hero"
  | "secondary"
  | "collapsed"
  | "summarized"
  | "hidden";

export type TileKind =
  | "DiscoveryDigestTile"
  | "StatusTile"
  | "ChatTile"
  | "FeedbackTile"
  | "BlockersTile"
  | "CommitsTile"
  | "DecisionsTile"
  | "FeatureCardTile";

export const TILE_MATRIX: Record<TileKind, Record<Role, TileVisual>> = {
  DiscoveryDigestTile: { pm: "hero", eng: "hero", user: "hero" },
  StatusTile: { pm: "hero", eng: "secondary", user: "hidden" },
  BlockersTile: { pm: "hero", eng: "hero", user: "hidden" },
  FeedbackTile: { pm: "hero", eng: "secondary", user: "secondary" },
  CommitsTile: { pm: "collapsed", eng: "hero", user: "hidden" },
  DecisionsTile: { pm: "hero", eng: "secondary", user: "hidden" },
  ChatTile: { pm: "summarized", eng: "hero", user: "summarized" },
  FeatureCardTile: { pm: "hidden", eng: "hidden", user: "hero" },
};

export const TILE_ORDER: TileKind[] = [
  "FeatureCardTile",
  "DiscoveryDigestTile",
  "StatusTile",
  "BlockersTile",
  "DecisionsTile",
  "FeedbackTile",
  "CommitsTile",
  "ChatTile",
];

export type StatusTilePayload = {
  headline: string;
  tone: "ok" | "warn" | "err";
  lastUpdate: string;
};

export type ChatTilePayload = {
  summary: string;
  openQuestions?: string[];
};

export type FeedbackTilePayload = {
  summary: string;
  themes?: string[];
};

export type FeatureCardTilePayload = {
  headline: string;
  currentlyDoing: string;
  whatsNext: string;
  tryIt?: string | null;
};
