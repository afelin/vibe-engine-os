export type VibeDepth = 0 | 1 | 2 | 3 | 4 | 5;

export type DepthCapabilities = {
  depth: VibeDepth;
  label: string;
  allowsPlanWrite: boolean;
  allowsCodegen: boolean;
  allowsDiskWrite: boolean;
  allowsTests: boolean;
  allowsDeploy: boolean;
  enforcesProtectedApproval: boolean;
};

const DEPTH_LABELS: Record<VibeDepth, string> = {
  0: "explain only",
  1: "plan only",
  2: "safe generated files",
  3: "tests + implementation",
  4: "deploy preview",
  5: "protected require /approve",
};

export function getVibeDepth(env: NodeJS.ProcessEnv = process.env): VibeDepth {
  const raw = env.VIBE_DEPTH ?? "3";
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 5) {
    return parsed as VibeDepth;
  }
  return 3;
}

export function depthCapabilities(depth: VibeDepth): DepthCapabilities {
  return {
    depth,
    label: DEPTH_LABELS[depth],
    allowsPlanWrite: depth >= 1,
    allowsCodegen: depth >= 2,
    allowsDiskWrite: depth >= 2,
    allowsTests: depth >= 3,
    allowsDeploy: depth >= 4,
    enforcesProtectedApproval: depth >= 5,
  };
}

export function renderDepthStatus(depth: VibeDepth = getVibeDepth()): string {
  const caps = depthCapabilities(depth);
  return `**Vibe Depth:** ${depth} (${caps.label})`;
}
