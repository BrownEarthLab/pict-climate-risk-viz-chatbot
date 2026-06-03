function PromptCard({ label, text, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-[24px] bg-white border border-black/5 p-5 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </p>

      <p className="mt-3 text-sm leading-6 text-neutral-700 group-hover:text-neutral-950">
        “{text}”
      </p>
    </button>
  );
}

export default PromptCard;