import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parse } from "yaml";

export interface WorkflowStep {
  id?: string;
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  shell?: string;
  env?: Record<string, string>;
  with?: Record<string, string | number | boolean>;
  "timeout-minutes"?: number;
  "continue-on-error"?: boolean | string;
}

export interface WorkflowJob {
  if?: string;
  needs?: string | string[];
  "runs-on": string;
  "timeout-minutes"?: number | string;
  "continue-on-error"?: boolean | string;
  env?: Record<string, string>;
  strategy?: { matrix: Record<string, unknown> };
  steps: WorkflowStep[];
}

export interface Workflow {
  on: Record<string, { inputs?: Record<string, { default?: unknown }> } | null>;
  jobs: Record<string, WorkflowJob>;
}

export function parseWorkflow(source: string): Workflow {
  const workflow = parse(source) as Workflow;
  assert.ok(workflow && typeof workflow === "object" && workflow.jobs);
  return workflow;
}

export function readWorkflow(name: string): Workflow {
  return parseWorkflow(
    readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), "utf8"),
  );
}

export function step(job: WorkflowJob, id: string): WorkflowStep {
  const matches = job.steps.filter((item) => item.id === id);
  assert.equal(matches.length, 1, `Expected exactly one workflow step with id ${id}`);
  return matches[0]!;
}

// Normalize script indentation and full-line comments, not shell semantics. Structural
// policy checks use parsed fields; exact command contracts and real CLI tests verify execution.
export function script(value: WorkflowStep | WorkflowJob): string {
  const source =
    "steps" in value ? value.steps.map((item) => item.run ?? "").join("\n") : value.run;
  return (source ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join("\n");
}

export function requireSuccess(job: WorkflowJob): void {
  assert.equal(job["continue-on-error"], undefined);
  for (const item of job.steps) assert.equal(item["continue-on-error"], undefined);
}
