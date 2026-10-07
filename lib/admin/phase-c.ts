// Lazy, failure-tolerant access to Phase C's agent pipeline.
//
// `lib/agent/pipeline.ts` is implemented by Phase C (parallel phase) and may
// not exist yet at runtime. Every loader here returns `null` when the module
// (or the expected export) is missing, so admin routes can respond with a
// clear 501 message instead of crashing.
//
// NOTE on the dynamic import: the specifier is a string literal, which
// Turbopack compiles into a lazy chunk without failing the build when the
// target file is absent (verified with next build). The ambient declaration in
// types/phase-c.d.ts keeps `tsc` green until the real module lands.

export interface AgentPipelineModule {
  runDailyAgent: (trigger: string) => Promise<unknown>;
  publishDuePosts?: () => Promise<unknown>;
  refreshOldPosts?: () => Promise<unknown>;
}

export async function loadAgentPipeline(): Promise<AgentPipelineModule | null> {
  try {
    const mod = (await import('@/lib/agent/pipeline')) as Partial<AgentPipelineModule>;
    if (typeof mod.runDailyAgent !== 'function') return null;
    return mod as AgentPipelineModule;
  } catch {
    return null;
  }
}

export function pipelineMissingResponse(): { error: string } {
  return {
    error:
      'The agent pipeline is not available yet (Phase C: lib/agent/pipeline.ts has not been implemented). ' +
      'This button will work once the pipeline lands — no data was changed.',
  };
}
