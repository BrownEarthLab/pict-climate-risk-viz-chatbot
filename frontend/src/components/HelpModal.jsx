function HelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-xl border border-black/5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm text-neutral-400">Prototype guide</p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900">
              Help & Documentation
            </h2>
          </div>

          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <HelpSection
            title="What this prototype does"
            body="This frontend prototype lets users create local conversations, search previous conversations, select starter prompts, and send mock climate-risk queries."
          />

          <HelpSection
            title="What is not connected yet"
            body="The chatbot does not call a real backend yet. Responses are placeholders. Later, this will connect to geospatial analysis functions, climate datasets, maps, charts, and uncertainty summaries."
          />

          <HelpSection
            title="Example questions"
            body="Try questions like: Compare wet-bulb trends across Pacific islands, explain projection uncertainty, or generate a map of high-risk areas."
          />

          <HelpSection
            title="Current storage"
            body="Conversations and settings are saved only in this browser using localStorage. There is no database or account system yet."
          />
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpSection({ title, body }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
      <p className="text-sm font-medium text-neutral-800">{title}</p>
      <p className="mt-1 text-sm leading-6 text-neutral-500">{body}</p>
    </div>
  );
}

export default HelpModal;