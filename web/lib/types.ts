export type WordScore = {
  word: string;
  score: number | null;
};

export type ClassifyResponse = {
  label: "normal" | "abusive" | string;
  confidence: number;
  probabilities: Record<string, number>;
  word_scores: WordScore[];
  truncated: boolean;
  latency_ms: number;
};

export type BulkResult = {
  text: string;
  p_abusive: number;
  flagged: boolean;
};

export type BulkResponse = {
  results: BulkResult[];
  flagged: number;
  total: number;
};

export type HealthResponse = {
  status: string;
  model: string;
  device: string;
};

export type HighlightFilter = "all" | "abusive" | "normal";

export type WorkspaceMode = "analyze" | "bulk";
