"use client";

import { artifactDownloadUrl } from "@/features/session/api";

export function ImageWorkspace({ artifactId }: { artifactId?: string }) {
  if (!artifactId) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center border border-dashed border-slate-300 bg-white">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-slate-800">No image artifact selected</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Generate an image or upload one to preview it here. Mask drawing arrives in the next phase.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[520px] items-center justify-center border border-slate-200 bg-white p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artifactDownloadUrl(artifactId)}
        alt="Active generated or edited artifact"
        className="max-h-full max-w-full border border-slate-200 object-contain"
      />
    </div>
  );
}
