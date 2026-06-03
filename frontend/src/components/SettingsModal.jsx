import { useEffect, useState } from "react";

const STORAGE_KEY = "pict-climate-risk-settings";

const defaultSettings = {
  theme: "Light",
  units: "Metric",
  defaultRegion: "Pacific Islands",
  showUncertaintyNotes: true,
  showPrototypeWarnings: true,
};

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function SettingsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState("Preferences");
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  function updateSetting(key, value) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-xl border border-black/5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm text-neutral-400">Prototype settings</p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900">
              Climate Risk A.I. Settings
            </h2>
          </div>

          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
          >
            ×
          </button>
        </div>

        <div className="mt-6 flex gap-2 rounded-2xl bg-neutral-100 p-1">
          {["Preferences", "Data", "Prototype"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-white text-neutral-950 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mt-6 min-h-[260px]">
          {activeTab === "Preferences" && (
            <div className="space-y-4">
              <SettingSelect
                label="Theme"
                description="Visual mode for the frontend prototype."
                value={settings.theme}
                options={["Light", "Dark later", "System later"]}
                onChange={(value) => updateSetting("theme", value)}
              />

              <SettingSelect
                label="Units"
                description="Preferred measurement system for future climate outputs."
                value={settings.units}
                options={["Metric", "Imperial"]}
                onChange={(value) => updateSetting("units", value)}
              />
            </div>
          )}

          {activeTab === "Data" && (
            <div className="space-y-4">
              <SettingSelect
                label="Default region"
                description="The region the prototype should assume first."
                value={settings.defaultRegion}
                options={[
                  "Pacific Islands",
                  "Fiji",
                  "Kiribati",
                  "Solomon Islands",
                  "Tonga",
                  "Vanuatu",
                ]}
                onChange={(value) => updateSetting("defaultRegion", value)}
              />

              <SettingToggle
                label="Show uncertainty notes"
                description="Include visible uncertainty reminders in future responses."
                checked={settings.showUncertaintyNotes}
                onChange={(value) => updateSetting("showUncertaintyNotes", value)}
              />
            </div>
          )}

          {activeTab === "Prototype" && (
            <div className="space-y-4">
              <SettingToggle
                label="Show prototype warnings"
                description="Remind users that chatbot responses are mocked for now."
                checked={settings.showPrototypeWarnings}
                onChange={(value) => updateSetting("showPrototypeWarnings", value)}
              />

              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-medium text-neutral-700">
                  Backend status
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  Not connected yet. This frontend currently stores conversations
                  and settings in browser memory only.
                </p>
              </div>
            </div>
          )}
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

function SettingSelect({ label, description, value, options, onChange }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-800">{label}</p>
          <p className="mt-1 text-sm text-neutral-400">{description}</p>
        </div>

        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none"
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-800">{label}</p>
          <p className="mt-1 text-sm text-neutral-400">{description}</p>
        </div>

        <button
          onClick={() => onChange(!checked)}
          className={`h-7 w-12 rounded-full p-1 transition ${
            checked ? "bg-neutral-950" : "bg-neutral-300"
          }`}
        >
          <span
            className={`block h-5 w-5 rounded-full bg-white transition ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export default SettingsModal;