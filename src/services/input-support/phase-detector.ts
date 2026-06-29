import {FieldData} from './types';

/**
 * Rule-based phase detection for input support workflow.
 * Phase 1: Data gathering (fill required fields)
 * Phase 2: Quality validation (all required filled)
 */
export class PhaseDetector {
    /**
     * Determine phase based on required field completion.
     * Phase 2 when all required fields filled, else Phase 1.
     *
     * @param fieldData - Array of form field states from frontend
     * @returns 'phase_1' (data gathering) or 'phase_2' (validation)
     */
    static determine(fieldData: FieldData[]): 'phase_1' | 'phase_2' {
        const allRequiredFilled = fieldData
            .filter(f => f.required)
            .every(f => f.field_value !== null && f.field_value.trim() !== '');

        return allRequiredFilled ? 'phase_2' : 'phase_1';
    }
}
