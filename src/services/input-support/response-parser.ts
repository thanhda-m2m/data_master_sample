import {ParsedAgentOutput} from './types';

/**
 * Marker-based parser for agent responses.
 * Agents append structured markers to outputs:
 * - ---PHASE:phase_1--- or ---PHASE:phase_2---
 * - ---EVALUATION--- (followed by validation text)
 * - ---JSON--- (followed by structured data)
 */
export class ResponseParser {
    /**
     * Parse agent output with markers into structured format.
     *
     * Markers:
     * - ---PHASE:phase_1--- or ---PHASE:phase_2---
     * - ---EVALUATION--- (text until next marker or end)
     * - ---JSON--- (JSON object until next marker or end)
     *
     * Returns user message (text before markers) + extracted structured data.
     * Gracefully handles missing markers and invalid JSON.
     *
     * @param rawOutput - Raw agent response string
     * @returns Parsed output with userMessage and optional structured fields
     */
    static parse(rawOutput: string): ParsedAgentOutput {
        const result: ParsedAgentOutput = {
            userMessage: rawOutput.trim()
        };

        // Extract PHASE marker
        const phaseMatch = rawOutput.match(/---PHASE:(phase_[12])---/);
        if (phaseMatch) {
            result.phase = phaseMatch[1] as 'phase_1' | 'phase_2';
        }

        // Extract EVALUATION section (text between EVALUATION marker and next marker or end)
        const evalMatch = rawOutput.match(/---EVALUATION---\s*\n([\s\S]*?)(?:---(?!EVALUATION)|$)/);
        if (evalMatch) {
            result.evaluation = evalMatch[1].trim();
        }

        // Extract JSON section
        const jsonMatch = rawOutput.match(/---JSON---\s*\n([\s\S]*?)(?:---(?!JSON)|$)/);
        if (jsonMatch) {
            try {
                const jsonText = jsonMatch[1].trim();
                result.jsonData = JSON.parse(jsonText);
            } catch (e) {
                console.warn('Failed to parse JSON from agent output:', e);
                // result.jsonData remains undefined (graceful degradation)
            }
        }

        // User message is everything before first marker
        const firstMarkerIndex = rawOutput.search(/---(?:PHASE:[^-]+|EVALUATION|JSON)---/);
        if (firstMarkerIndex !== -1) {
            result.userMessage = rawOutput.substring(0, firstMarkerIndex).trim();
        }

        return result;
    }
}
