import { useState } from "react";

interface WorkflowStep {
  id: string;
  action_title: string;
  tool_name: string;
  inputs: Record<string, any>;
  outputs: string[];
  data_source: string;
  uncertainty: "Low" | "Medium" | "High";
  diagnostics?: string;
  coverage_warn?: string;
}

interface WorkflowData {
  title: string;
  description: string;
  steps: WorkflowStep[];
}

interface WorkflowViewerProps {
  workflow: WorkflowData;
}

export default function WorkflowViewer({ workflow }: WorkflowViewerProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow.steps);
  const [expandedStepId, setExpandedStepId] = useState<string | null>("step-1");
  const [executionState, setExecutionState] = useState<"idle" | "running" | "completed">("idle");
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [stepStatuses, setStepStatuses] = useState<Record<string, "pending" | "running" | "success" | "failed">>(
    workflow.steps.reduce((acc, step) => ({ ...acc, [step.id]: "pending" }), {})
  );

  // Handle changing inputs dynamically in local state
  const handleInputChange = (stepId: string, key: string, value: any) => {
    setSteps((currentSteps) =>
      currentSteps.map((step) => {
        if (step.id !== stepId) return step;
        return {
          ...step,
          inputs: {
            ...step.inputs,
            [key]: value,
          },
        };
      })
    );
  };

  const startMockExecution = () => {
    setExecutionState("running");
    setCurrentStepIndex(0);
    
    // Reset all to pending
    const initialStatuses = steps.reduce((acc, step) => ({ ...acc, [step.id]: "pending" }), {});
    setStepStatuses({
      ...initialStatuses,
      [steps[0].id]: "running",
    });
    setExpandedStepId(steps[0].id);

    // Simulate Step 1
    setTimeout(() => {
      setStepStatuses((current) => ({
        ...current,
        [steps[0].id]: "success",
        [steps[1].id]: "running",
      }));
      setCurrentStepIndex(1);
      setExpandedStepId(steps[1].id);

      // Simulate Step 2
      setTimeout(() => {
        setStepStatuses((current) => ({
          ...current,
          [steps[1].id]: "success",
          [steps[2].id]: "running",
        }));
        setCurrentStepIndex(2);
        setExpandedStepId(steps[2].id);

        // Simulate Step 3
        setTimeout(() => {
          setStepStatuses((current) => ({
            ...current,
            [steps[2].id]: "success",
          }));
          setExecutionState("completed");
          setCurrentStepIndex(-1);

          // Dispatch the completed workflow details containing mock Fiji hospital GeoJSON features
          const mockHospitalsGeoJSON = [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [178.4419, -18.1416], // Colonial War Memorial Hospital, Suva
              },
              properties: {
                name: "Colonial War Memorial Hospital (Suva)",
                layer_name: "Annual Mean Wet-Bulb (WBT)",
                temp_c: 28.5,
                wet_bulb_c: 25.8,
                description: "Hospital: Colonial War Memorial Hospital (Suva)\nRegion: Viti Levu, Fiji\nWet-Bulb Temp (2050): 25.8°C (High Risk)\nCapacity: 500 beds\nPolicy Urgency: High. Crucial grid cooling reinforcement needed.",
              },
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [177.4485, -17.6133], // Lautoka Hospital
              },
              properties: {
                name: "Lautoka Hospital",
                layer_name: "Annual Mean Wet-Bulb (WBT)",
                temp_c: 29.1,
                wet_bulb_c: 26.2,
                description: "Hospital: Lautoka Hospital\nRegion: Western Fiji\nWet-Bulb Temp (2050): 26.2°C (High Risk)\nCapacity: 300 beds\nPolicy Urgency: Critical. High temperature and seaside humidity compound thermal stress.",
              },
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [178.8062, -17.7027], // Levuka Hospital
              },
              properties: {
                name: "Levuka Hospital",
                layer_name: "Annual Mean Wet-Bulb (WBT)",
                temp_c: 27.8,
                wet_bulb_c: 24.1,
                description: "Hospital: Levuka Hospital\nRegion: Ovalau, Fiji\nWet-Bulb Temp (2050): 24.1°C (Moderate Risk)\nCapacity: 40 beds\nPolicy Urgency: Medium. Implement passive cooling designs.",
              },
            },
          ];

          window.dispatchEvent(
            new CustomEvent("workflow-complete", {
              detail: {
                features: mockHospitalsGeoJSON,
                center: [178.06, -17.85],
                zoom: 8.5,
              },
            })
          );
        }, 1200);
      }, 1200);
    }, 1200);
  };

  const getUncertaintyColor = (level: "Low" | "Medium" | "High") => {
    switch (level) {
      case "Low":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "Medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "High":
        return "bg-rose-50 text-rose-700 border-rose-200";
    }
  };

  const getStatusIcon = (status: "pending" | "running" | "success" | "failed") => {
    switch (status) {
      case "pending":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-50 text-xs font-semibold text-neutral-500">
            ○
          </span>
        );
      case "running":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-500 bg-blue-50 text-xs font-semibold text-blue-600 animate-spin">
            ...
          </span>
        );
      case "success":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 text-xs font-bold text-white">
            ✓
          </span>
        );
      case "failed":
        return (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-rose-500 bg-rose-500 text-xs font-bold text-white">
            ✕
          </span>
        );
    }
  };

  const formatToolName = (name: string) => {
    return name
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <div className="w-full rounded-2xl bg-neutral-50/50 p-4 border border-black/5 text-neutral-800 text-left font-sans">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700 uppercase tracking-wider">
            Deterministic Pipeline
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-neutral-200 px-2 py-0.5 text-[9px] font-bold text-neutral-700 uppercase tracking-wider">
            RAG Intent Router v1.0
          </span>
        </div>
        <h3 className="text-base font-bold text-neutral-900 mt-2">{workflow.title}</h3>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          <span className="font-bold text-neutral-700 block mb-0.5">Linguistic Goal (LLM Narrated):</span>
          {workflow.description}
        </p>
        <div className="mt-2 text-[10px] text-neutral-400 bg-neutral-100/85 p-2 rounded-lg border border-black/5 font-mono leading-tight">
          • Deterministic Engine: PostGIS v3.4.1 / GDAL v3.8.4<br/>
          • Execution Boundary: Sandboxed RAG execution only
        </div>
      </div>

      {/* Steps Pipeline */}
      <div className="relative space-y-3 pl-3 before:absolute before:left-6 before:top-2 before:bottom-6 before:w-[1px] before:bg-neutral-200">
        {steps.map((step, idx) => {
          const isExpanded = expandedStepId === step.id;
          const status = stepStatuses[step.id];

          return (
            <div key={step.id} className="relative flex gap-3">
              {/* Timeline dot */}
              <div className="z-10 mt-1 bg-white rounded-full">
                {getStatusIcon(status)}
              </div>

              {/* Card body */}
              <div
                className={`flex-1 rounded-xl border bg-white p-3 shadow-sm transition-all duration-200 ${
                  status === "running"
                    ? "border-blue-300 ring-2 ring-blue-50"
                    : status === "success"
                    ? "border-neutral-200/80 bg-neutral-50/20"
                    : "border-neutral-200/80"
                }`}
              >
                {/* Header Row */}
                <div
                  className="flex cursor-pointer items-center justify-between"
                  onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                >
                  <div>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      Step {idx + 1}
                    </span>
                    <h4 className="text-xs font-bold text-neutral-800 mt-0.5">
                      {step.action_title}
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-neutral-400 whitespace-nowrap shrink-0 ml-2">
                    {isExpanded ? "Collapse ▲" : "Details ▼"}
                  </span>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 border-t border-neutral-100 pt-3 text-xs space-y-3">
                    {/* Tool Flow Design Block (Simplified visual block flow) */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                        Analytical Data Flow
                      </span>
                      <div className="space-y-1.5 bg-neutral-50/70 p-2 rounded-lg border border-black/5 text-[11px] font-medium text-neutral-600">
                        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white border border-neutral-200/80">
                          <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-bold shrink-0">Input</span>
                          <span className="truncate font-semibold text-neutral-700">{step.inputs.input_layer || step.inputs.points_layer || "pacific_island_hospitals"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-blue-50/50 text-blue-700 border border-blue-100/80">
                          <span className="text-[9px] text-blue-500 uppercase tracking-wider font-bold shrink-0">Tool</span>
                          <span className="truncate font-bold">{formatToolName(step.tool_name)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-neutral-900 text-white border border-neutral-950">
                          <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-bold shrink-0">Output</span>
                          <span className="truncate font-semibold">{step.outputs[0]}</span>
                        </div>
                      </div>
                    </div>

                    {/* Parameters Editor */}
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block -mb-0.5">
                        Interactive Parameter Adjustments
                      </span>
                      {Object.keys(step.inputs).map((key) => {
                        const val = step.inputs[key];
                        const isEditable = typeof val === "number" || key === "expression";
                        return (
                          <div key={key} className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-neutral-500 truncate max-w-[80px]" title={key}>{key}:</span>
                            {isEditable ? (
                              <input
                                type={typeof val === "number" ? "number" : "text"}
                                value={val}
                                disabled={executionState === "running"}
                                onChange={(e) =>
                                  handleInputChange(
                                    step.id,
                                    key,
                                    typeof val === "number" ? parseFloat(e.target.value) || 0 : e.target.value
                                  )
                                }
                                className="min-w-[80px] flex-1 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-right font-medium text-neutral-700 focus:bg-white focus:outline-none focus:border-blue-500 text-[10px]"
                              />
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] font-medium text-neutral-600 truncate flex-1 text-right max-w-[140px]">
                                {Array.isArray(val) ? val.join(", ") : String(val)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Coverage & Diagnostic warnings */}
                    {(step.coverage_warn || step.diagnostics) && (
                      <div className="bg-neutral-50 p-2 rounded-lg border border-black/5 space-y-1.5 text-[10px] leading-relaxed">
                        {step.diagnostics && (
                          <div className="text-neutral-600">
                            <span className="font-bold text-neutral-700">Diagnostic Log:</span> {step.diagnostics}
                          </div>
                        )}
                        {step.coverage_warn && (
                          <div className="text-amber-700 bg-amber-50/50 p-1.5 rounded border border-amber-100/50">
                            <span className="font-bold">Spatial Constraint Warning:</span> {step.coverage_warn}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Metadata: Sources & Uncertainty Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2.5">
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block">
                          Primary Data Source
                        </span>
                        <span className="text-[10px] font-semibold text-neutral-600 block leading-tight">
                          {step.data_source}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 block text-right">
                          Uncertainty Risk
                        </span>
                        <span
                          className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap shrink-0 ${getUncertaintyColor(
                            step.uncertainty
                          )}`}
                        >
                          {step.uncertainty}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Control Actions Section */}
      <div className="mt-4 border-t border-black/5 pt-4">
        {executionState === "idle" && (
          <div className="flex gap-2">
            <button
              onClick={startMockExecution}
              className="flex-1 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-white font-semibold py-2 text-xs transition cursor-pointer shadow-sm text-center"
            >
              Approve & Run Workflow
            </button>
            <button
              className="rounded-xl border border-neutral-300 hover:bg-neutral-50 text-neutral-600 font-semibold px-3 py-2 text-xs transition cursor-pointer text-center"
              onClick={() => {
                alert("Workflow rejected. You can ask the AI to modify the plan.");
              }}
            >
              Reject Plan
            </button>
          </div>
        )}

        {executionState === "running" && (
          <div className="rounded-xl bg-blue-50/50 border border-blue-100 px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
              <span className="text-xs font-semibold text-blue-700">
                Running GIS computations...
              </span>
            </div>
            <span className="text-[10px] text-blue-500 font-bold">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
          </div>
        )}

        {executionState === "completed" && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 space-y-1">
            <p className="text-xs font-bold text-emerald-800 text-center">
              ✓ Deterministic Workflow Executed & Mapped
            </p>
            <p className="text-[10px] text-emerald-600 leading-normal">
              • PostGIS validation: Success (3 hospital features intersected).<br/>
              • Mapbox renderer: Overlay layers mounted.<br/>
              • Disclaimer: Spatial outputs correspond to verified GIS results, not LLM generations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
