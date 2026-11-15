import type { ModelCard, ModelCardHorizon, ModelCardVariable } from '../../core/forecast/model-card';
import { maeNumber } from './analysis-model';

function horizonResult(h: ModelCardHorizon) {
  if (!h.enabled) return <>Disabled: {h.reason}</>;
  return (
    <>
      Enabled: beats both baselines by {h.improvementPct.toFixed(1)}% ({h.missionsBeatingBoth} of {h.testMissions} held-out missions)
    </>
  );
}

function VariableRows({ v, label }: { v: ModelCardVariable; label: string }) {
  return (
    <>
      {v.horizons.map((h, i) => (
        <tr key={h.horizonH} data-variable={v.variable} data-horizon={h.horizonH} data-enabled={h.enabled}>
          {i === 0 ? (
            <th scope="row" rowSpan={v.horizons.length}>
              {label}
              <br />
              <span className="muted small">{v.trainingMissions.length} missions, {Math.round(v.days)} days</span>
            </th>
          ) : null}
          <td>{h.horizonH} h</td>
          <td>{maeNumber(v.variable, h.modelMae)}</td>
          <td>{maeNumber(v.variable, h.persistenceMae)}</td>
          <td>{maeNumber(v.variable, h.seasonalNaiveMae)}</td>
          <td>{horizonResult(h)}</td>
        </tr>
      ))}
    </>
  );
}

const LABEL: Record<string, string> = { co2: 'Cabin CO2 (ppm)', cabinTemperature: 'Cabin temperature (°C)', humidity: 'Relative humidity (%)' };

/** What the forecast is built on and how well it does against two simple baselines. Presentational: no store access. */
export function ForecastModelCard({ card }: { card: ModelCard }) {
  const days = card.variables.map((v) => `${v.variable === 'co2' ? 'CO2' : v.variable === 'humidity' ? 'humidity' : 'temperature'} ${Math.round(v.days)} days`).join(', ');
  const missions = [...new Set(card.variables.flatMap((v) => v.trainingMissions))];
  return (
    <div className="method__block" role="group" aria-label="Forecast model card">
      <h4 className="method__title">Forecast model card</h4>
      <p className="muted small">
        Short-term forecasts of the cabin variables at 1, 3 and 6 hours. Informational: a forecast is never a diagnosis and never changes an
        attribution verdict.
      </p>
      <p className="small">
        <strong>Data.</strong> Trained on {missions.length} real ISS missions from the{' '}
        <a href={card.sourceUrl} target="_blank" rel="noreferrer">
          NASA Open Science Data Repository
        </a>{' '}
        ({missions.join(', ')}), fetched {card.fetchedAt.slice(0, 10)}.
      </p>
      <p className="small">
        <strong>Calibration.</strong> The simulated cabin is calibrated on the same telemetry, cleaned and put on a 15-minute grid: {days}.
      </p>
      <p className="small">
        <strong>Method.</strong> Ridge regression per variable and horizon on recent lags, slope and time of day. {card.testMethod} Scores are the
        mean absolute error (MAE) on the held-out missions, against persistence (the last value) and seasonal naive (the value 24 hours earlier). A
        horizon is shown in the app only if its MAE beats both.
      </p>
      <div className="table-wrap">
        <table className="table forecast-table" aria-label="Forecast error against baselines">
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col">Horizon</th>
              <th scope="col">Model MAE</th>
              <th scope="col">Persistence MAE</th>
              <th scope="col">Seasonal naive MAE</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {card.variables.map((v) => (
              <VariableRows key={v.variable} v={v} label={LABEL[v.variable] ?? v.variable} />
            ))}
          </tbody>
        </table>
      </div>
      {card.hasDisabled ? (
        <p className="muted small">Disabled horizons are never shown in Cabin air: they did not beat both baselines on held-out missions.</p>
      ) : null}
    </div>
  );
}
