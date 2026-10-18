import {
  DEFAULT_CLIMATE_CUTOFFS,
  normalizeClimateCutoffs,
  type ClimateCutoffs,
} from "./climateValueByAlpha";

interface ClimateValueByAlphaControlsProps {
  value: ClimateCutoffs;
  onChange: (next: ClimateCutoffs) => void;
}

function formatReliability(value: number): string {
  return value.toFixed(2);
}

const ClimateValueByAlphaControls = ({
  value,
  onChange,
}: ClimateValueByAlphaControlsProps) => {
  const update = (patch: Partial<ClimateCutoffs>) => {
    onChange(normalizeClimateCutoffs({ ...value, ...patch }));
  };

  return (
    <div className="mt-3 rounded-lg border border-[#BFD7ED] bg-white/90 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[9px] font-black uppercase tracking-wide text-[#174A73]">
            Value-by-alpha cutoffs
          </div>
          <p className="mt-0.5 text-[9px] leading-snug text-slate-500">
            Customize display classes only. Climate values are not recomputed.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_CLIMATE_CUTOFFS })}
          className="shrink-0 rounded-md border border-[#BFD7ED] bg-[#E8F1F9] px-2 py-1 text-[9px] font-bold text-[#174A73] hover:bg-[#D8E8F5]"
        >
          Studied defaults
        </button>
      </div>

      <div className="mt-2">
        <div className="text-[9px] font-bold text-slate-600">
          TX90p risk color boundaries (%)
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[8px] font-bold uppercase text-slate-400">
              Blue → tan
            </span>
            <input
              type="number"
              min={0}
              max={Math.max(0, value.riskHighMin - 1)}
              step={1}
              value={value.riskLowMax}
              onChange={(event) =>
                update({ riskLowMax: Number(event.target.value) })
              }
              className="mt-0.5 h-7 w-full rounded-md border border-[#BFD7ED] bg-white px-2 text-[10px] font-bold text-[#003F7B] outline-none focus:border-[#174A73]"
            />
          </label>

          <label className="block">
            <span className="text-[8px] font-bold uppercase text-slate-400">
              Tan → orange
            </span>
            <input
              type="number"
              min={Math.min(100, value.riskLowMax + 1)}
              max={100}
              step={1}
              value={value.riskHighMin}
              onChange={(event) =>
                update({ riskHighMin: Number(event.target.value) })
              }
              className="mt-0.5 h-7 w-full rounded-md border border-[#BFD7ED] bg-white px-2 text-[10px] font-bold text-[#003F7B] outline-none focus:border-[#174A73]"
            />
          </label>
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[9px] font-bold text-slate-600">
          Reliability / opacity boundaries
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[8px] font-bold uppercase text-slate-400">
              Low → medium
            </span>
            <input
              type="number"
              min={0}
              max={Math.max(0, value.reliabilityHighMin - 0.01)}
              step={0.01}
              value={formatReliability(value.reliabilityLowMax)}
              onChange={(event) =>
                update({ reliabilityLowMax: Number(event.target.value) })
              }
              className="mt-0.5 h-7 w-full rounded-md border border-[#BFD7ED] bg-white px-2 text-[10px] font-bold text-[#174A73] outline-none focus:border-[#174A73]"
            />
          </label>

          <label className="block">
            <span className="text-[8px] font-bold uppercase text-slate-400">
              Medium → high
            </span>
            <input
              type="number"
              min={Math.min(1, value.reliabilityLowMax + 0.01)}
              max={1}
              step={0.01}
              value={formatReliability(value.reliabilityHighMin)}
              onChange={(event) =>
                update({ reliabilityHighMin: Number(event.target.value) })
              }
              className="mt-0.5 h-7 w-full rounded-md border border-[#BFD7ED] bg-white px-2 text-[10px] font-bold text-[#174A73] outline-none focus:border-[#174A73]"
            />
          </label>
        </div>
      </div>

      <div className="mt-2 space-y-0.5 rounded-md bg-[#F3F7FA] p-2 text-[8px] leading-snug text-[#263746]">
        <div>
          <span className="font-bold" style={{ color: "#0067B1" }}>Blue</span>
          {" "}&lt; {value.riskLowMax}% ·{" "}
          <span className="font-bold" style={{ color: "#8A7358" }}>Tan</span>
          {" "}{value.riskLowMax}–&lt;{value.riskHighMin}% ·{" "}
          <span className="font-bold" style={{ color: "#F47A00" }}>Orange</span>
          {" "}≥ {value.riskHighMin}%
        </div>
        <div>
          Opacity: low &lt; {formatReliability(value.reliabilityLowMax)} ·
          medium {formatReliability(value.reliabilityLowMax)}–&lt;
          {formatReliability(value.reliabilityHighMin)} · high ≥{" "}
          {formatReliability(value.reliabilityHighMin)}
        </div>
      </div>
    </div>
  );
};

export default ClimateValueByAlphaControls;
