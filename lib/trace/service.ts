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
