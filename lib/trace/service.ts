import { prisma } from "@/lib/db/prisma";
import type { TraceStatus } from "@/types";

type SerializableJson = unknown;

export interface StartTraceInput {
  sessionId: string;
  versionId?: string | null;
  pipelineName: string;
  stageName: string;
  inputSummary: string;
  modelUsed?: string;
  metadata?: SerializableJson;
}

export interface FinishTraceInput {
  traceId: string;
  status: TraceStatus;
  outputSummary?: string | null;
  repairApplied?: boolean;
  tokenUsage?: SerializableJson;
  errorMessage?: string;
  metadata?: SerializableJson;
}

export interface TracedStageInput {
  sessionId?: string;
  versionId?: string | null;
  pipelineName: string;
  stageName: string;
  inputSummary: string;
  modelUsed?: string;
  metadata?: SerializableJson;
}

export interface TracedStageResult<T> {
  result: T;
  traceId?: string;
}

function serializeJson(value: SerializableJson | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

export async function startTrace(input: StartTraceInput) {
  return prisma.openAITrace.create({
    data: {
      sessionId: input.sessionId,
      versionId: input.versionId,
      pipelineName: input.pipelineName,
      stageName: input.stageName,
      inputSummary: input.inputSummary,
      modelUsed: input.modelUsed,
      metadata: serializeJson(input.metadata)
    }
  });
}

export async function finishTrace(input: FinishTraceInput) {
  const endedAt = new Date();
  const existing = await prisma.openAITrace.findUniqueOrThrow({
    where: { id: input.traceId },
    select: { startedAt: true }
  });

  return prisma.openAITrace.update({
    where: { id: input.traceId },
    data: {
      endedAt,
      latencyMs: endedAt.getTime() - existing.startedAt.getTime(),
      status: input.status,
      outputSummary: input.outputSummary,
      repairApplied: input.repairApplied ?? false,
      tokenUsage: serializeJson(input.tokenUsage),
      errorMessage: input.errorMessage,
      metadata: serializeJson(input.metadata)
    }
  });
}

export async function listSessionTraces(sessionId: string) {
  return prisma.openAITrace.findMany({
    where: { sessionId },
    orderBy: { startedAt: "asc" }
  });
}

export function summarizeForTrace(value: unknown, maxLength = 800): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);

  if (raw.length <= maxLength) {
    return raw;
  }

  return `${raw.slice(0, maxLength - 3)}...`;
}

export async function runTracedStage<T>(
  input: TracedStageInput,
  operation: () => Promise<T>,
  summarizeOutput: (result: T) => string = (result) => summarizeForTrace(result)
): Promise<TracedStageResult<T>> {
  if (!input.sessionId) {
    const result = await operation();
    return { result };
  }

  const trace = await startTrace({
    sessionId: input.sessionId,
    versionId: input.versionId,
    pipelineName: input.pipelineName,
    stageName: input.stageName,
    inputSummary: input.inputSummary,
    modelUsed: input.modelUsed,
    metadata: input.metadata
  });

  try {
    const result = await operation();

    await finishTrace({
      traceId: trace.id,
      status: "success",
      outputSummary: summarizeOutput(result)
    });

    return { result, traceId: trace.id };
  } catch (error) {
    await finishTrace({
      traceId: trace.id,
      status: "error",
      outputSummary: null,
      errorMessage: (error as Error).message
    });

    throw error;
  }
}
