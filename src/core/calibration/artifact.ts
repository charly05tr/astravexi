import type { VariableProvenance } from '../forecast/model';
import type { ForecastVariable } from '../forecast/types';
import type { VariableCalibration } from './fit';

/** Shape of src/knowledge/cabin-calibration.json: the fitted parameters of the simulated nominal cabin. */
export interface CabinCalibrationArtifact {
  schemaVersion: 1;
  provenance: {
    source: string;
    sourceUrl: string;
    fetchedAt: string;
    generatedOn: string;
    gridMinutes: number;
    method: string;
    variables: Record<ForecastVariable, VariableProvenance>;
  };
  variables: Record<ForecastVariable, VariableCalibration>;
}
