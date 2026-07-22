export type FlowStep = {
  id: string;
  label: string;
  description: string;
  status: string;
  mode: string;
  validation: string;
  owner: string;
};

export const sourceStep: FlowStep = {
  id: 'source',
  label: 'Content source',
  description: 'Read MDX and frontmatter',
  status: 'ready',
  mode: 'Full',
  validation: 'Required',
  owner: 'Docs platform'
};

export const transformStep: FlowStep = {
  id: 'transform',
  label: 'Transform',
  description: 'Resolve sections and metadata',
  status: 'active',
  mode: 'Incremental',
  validation: 'Required',
  owner: 'Docs platform'
};

export const publishStep: FlowStep = {
  id: 'publish',
  label: 'Publish',
  description: 'Emit route payload',
  status: 'queued',
  mode: 'Manual',
  validation: 'Optional',
  owner: 'Release team'
};

export const flowSteps: FlowStep[] = [sourceStep, transformStep, publishStep];

/** Steps indexed by id for constant-time selection lookup. */
export const flowStepsById: ReadonlyMap<string, FlowStep> = new Map(
  flowSteps.map(step => [step.id, step])
);

export const initialFlowStep = transformStep;
