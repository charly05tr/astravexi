import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useAppContext } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';

const CUSTOM = '__custom__';

/** http to a host other than this computer: the key would cross the network unencrypted. */
export function isInsecureRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Bring-your-own-key settings for the AI assistant. The key stays on this device: in memory and in
 * sessionStorage, or in localStorage only when "Remember on this device" is ticked.
 */
export function AiSettingsDialog() {
  const { aiSettings, aiModels } = useAppContext();
  const { aiSettingsOpen, setAiSettingsOpen } = useUi();
  if (!aiSettingsOpen) return null;
  return <AiSettingsForm onClose={() => setAiSettingsOpen(false)} store={aiSettings} catalog={aiModels} />;
}

function AiSettingsForm({
  onClose,
  store,
  catalog,
}: {
  onClose(): void;
  store: ReturnType<typeof useAppContext>['aiSettings'];
  catalog: ReturnType<typeof useAppContext>['aiModels'];
}) {
  const ids = { key: useId(), model: useId(), custom: useId(), url: useId(), remember: useId() };
  const initial = store.get();
  const preset = store.presets.models.includes(initial.model);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [modelChoice, setModelChoice] = useState(preset ? initial.model : CUSTOM);
  const [customModel, setCustomModel] = useState(preset ? '' : initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [remember, setRemember] = useState(initial.remember);
  const model = modelChoice === CUSTOM ? customModel : modelChoice;
  // Models the key can really call, once loaded. Until then (or if listing fails) the presets are offered.
  const [loaded, setLoaded] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ ok: boolean; message: string } | null>(null);
  const options = loaded ?? store.presets.models;

  const loadModels = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const ids = await catalog.listModels({ apiKey, baseUrl: baseUrl.trim() || store.presets.defaultBaseUrl });
      if (ids.length === 0) {
        setCheckResult({ ok: false, message: 'Connected, but no models were listed. Pick or type a model yourself.' });
        return;
      }
      setLoaded(ids);
      // Keep the current choice if the key can call it; otherwise take the newest stable flash model.
      if (!ids.includes(model.trim())) {
        const picked = catalog.pickDefault(ids) ?? ids[0]!;
        setModelChoice(picked);
        setCustomModel('');
      }
      setCheckResult({ ok: true, message: `Connected. ${ids.length} models available.` });
    } catch (error) {
      setCheckResult({ ok: false, message: error instanceof Error ? error.message : 'Could not load models.' });
    } finally {
      setChecking(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    store.set({
      apiKey: apiKey.trim(),
      model: model.trim(),
      baseUrl: baseUrl.trim() || store.presets.defaultBaseUrl,
      remember,
    });
    onClose();
  };

  const forget = () => {
    store.clear();
    onClose();
  };

  return (
    <Dialog title="AI assistant" closeLabel="Close AI settings" onClose={onClose} style={{ width: 'min(520px, 92vw)' }}>
      <form className="form" onSubmit={save}>
        <p className="muted small">
          After you accept a recommendation, the assistant can suggest a follow-up: a routine change or a new habit. It
          only proposes. Your alerts come from the rules. Requests go straight from this browser to the service you
          choose, using your own key.
        </p>

        <div className="field">
          <label className="field__label" htmlFor={ids.key}>
            API key
          </label>
          <input
            id={ids.key}
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="field__hint">Kept on this device only. It is never sent anywhere except the service below.</p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor={ids.model}>
            Model
          </label>
          <select
            id={ids.model}
            className="input"
            value={modelChoice}
            onChange={(e) => setModelChoice(e.target.value)}
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={CUSTOM}>Custom model...</option>
          </select>
        </div>

        {modelChoice === CUSTOM ? (
          <div className="field">
            <label className="field__label" htmlFor={ids.custom}>
              Custom model name
            </label>
            <input
              id={ids.custom}
              className="input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
            />
          </div>
        ) : null}

        <div className="field">
          <div className="proposal__actions">
            <Button size="small" disabled={!apiKey.trim() || checking} onClick={() => void loadModels()}>
              {checking ? 'Checking...' : 'Test connection and load models'}
            </Button>
          </div>
          {checkResult ? (
            <p className={checkResult.ok ? 'field__hint' : 'field__error'} role={checkResult.ok ? 'status' : 'alert'}>
              {checkResult.message}
            </p>
          ) : null}
        </div>

        {isInsecureRemoteUrl(baseUrl) ? (
          <p className="field__error" role="alert">
            This address is not encrypted (http). Your API key would be sent in clear text. Use https, or a server on
            this computer (localhost).
          </p>
        ) : null}

        <details className="zone-section">
          <summary>Advanced</summary>
          <div className="field">
            <label className="field__label" htmlFor={ids.url}>
              Base URL
            </label>
            <input
              id={ids.url}
              className="input"
              type="url"
              autoComplete="off"
              spellCheck={false}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="field__hint">
              Any OpenAI-compatible server. For a local one, try http://localhost:11434/v1/ (Ollama needs OLLAMA_ORIGINS
              to allow this page).
            </p>
          </div>
        </details>

        <div className="check-row">
          <input
            id={ids.remember}
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <label htmlFor={ids.remember}>Remember on this device</label>
        </div>
        <p className="field__hint">
          Off by default: the key is forgotten when you close this tab. Turn it on only on a device you trust.
        </p>

        <div className="proposal__actions">
          <Button type="submit" variant="primary">
            Save
          </Button>
          <Button onClick={forget}>Forget key and settings</Button>
        </div>
      </form>
    </Dialog>
  );
}
