// Shared types for the Phase C agent pipeline. Signatures are locked:
// later phases must not change them.

/** A single fixed topic handed to the pipeline by the seed or the planner. */
export interface FixedTopic {
  keyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  categorySlug: string;
  angle?: string;
  rationale?: string;
}

/** What generatePost returns after a post is created. */
export interface GeneratedPostSummary {
  postId: string;
  slug: string;
  title: string;
  wordCount: number;
  qaScore: number;
}

/** The pipeline contract Phase C implements in lib/agent/pipeline.ts. */
export interface AgentPipeline {
  generatePost(
    topic: FixedTopic,
    opts?: { runId?: string },
  ): Promise<GeneratedPostSummary>;
}
