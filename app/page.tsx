export default function HomePage() {
  return (
    <main className="min-h-screen bg-panel text-ink">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Phase 1 scaffold</p>
          <h1 className="mt-2 text-3xl font-semibold">OpenAI-Native Diagram and Image Editor</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
            The project foundation is in place: typed domain models, Prisma persistence,
            local artifact storage, session history helpers, traces, and minimal API routes.
            Full diagram and image editing workflows arrive in later phases.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-medium">Session History</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Sessions create an initial version and can move the active pointer back to earlier versions.
            </p>
          </div>
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-medium">Artifacts</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Images, XML, previews, masks, and source files are represented by typed metadata.
            </p>
          </div>
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-medium">OpenAI Boundary</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              OpenAI workflows have a centralized typed service interface ready for Phase 2.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
