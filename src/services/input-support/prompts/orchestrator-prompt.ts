import {FieldData} from '../types';

/**
 * Build system prompt for orchestrator agent.
 * Routes to SimpleAssistAgent (Phase 1) or QualityCheckAgent (Phase 2).
 */
export function buildOrchestratorPrompt(
    phase: 'phase_1' | 'phase_2',
    fieldData: FieldData[]
): string {
    const fieldSummary = fieldData
        .map(f => `- ${f.field_name} (${f.field_type}, required: ${f.required}): ${f.field_value || 'EMPTY'}`)
        .join('\n');

    const phaseDescription = phase === 'phase_1'
        ? 'Phase 1 (Data Gathering): Not all required fields are filled. Use simple_assist_agent tool.'
        : 'Phase 2 (Quality Check): All required fields are filled. Use quality_check_agent tool.';

    return `You are an input support orchestrator. Your job is to route user questions to the correct specialized agent.

Current Phase: ${phase}
${phaseDescription}

Current Field Data:
${fieldSummary}

CRITICAL RULES:
1. You must ONLY call the agent appropriate for the current phase
2. Pass the user's latest message to the agent via the 'user_message' parameter
3. Return the agent's response VERBATIM - do not add commentary or modify it
4. The agent response contains special markers (---PHASE---, ---JSON---, ---EVALUATION---) - preserve them exactly

Current phase is ${phase}. ${phase === 'phase_1' ? 'Call simple_assist_agent now.' : 'Call quality_check_agent now.'}`;
}
