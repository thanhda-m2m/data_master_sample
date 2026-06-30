import {z} from 'zod';

// ============================================================================
// Request Schemas & Types
// ============================================================================

/**
 * Represents a single form field with its current state.
 * Sent from frontend in every request.
 */
export const FieldDataSchema = z.object({
    field_id: z.string(),
    field_name: z.string(),
    field_value: z.string().nullable(),
    field_type: z.string(),
    required: z.boolean(),
    options: z.array(z.object({
        value: z.string(),
        label: z.string()
    })).nullable(),
    evaluation_target: z.boolean()
});

export type FieldData = z.infer<typeof FieldDataSchema>;

/**
 * Chat message in conversation history.
 * Role: 'user' (human), 'assistant' or 'ai' (LLM response)
 */
export const ChatMessageSchema = z.object({
    role: z.enum(['user', 'assistant', 'ai']),
    content: z.string()
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Complete request payload from frontend.
 * Contains form state + conversation history.
 */
export const InputSupportRequestSchema = z.object({
    field_data: z.array(FieldDataSchema),
    chat_history: z.array(ChatMessageSchema)
});

export type InputSupportRequest = z.infer<typeof InputSupportRequestSchema>;

// ============================================================================
// SSE Event Types
// ============================================================================

/**
 * Token event: streaming text chunk during agent response
 */
export type TokenEvent = {
    type: 'token';
    content: string;
};

/**
 * Done event: final structured data after agent completes
 * Phase 1: includes field_name + field_value for form update
 * Phase 2: includes evaluation object with validation result
 */
export type DoneEvent = {
    type: 'done';
    phase: 'phase_1' | 'phase_2';
    structured_data?: {
        field_id?: string;
        field_name?: string;
        field_value?: string;
        evaluation?: {
            field_id: string;
            field_name: string;
            is_valid: boolean;
            confidence: number;
            reason: string;
        };
    };
};

/**
 * Error event: sent when request fails or agent errors
 */
export type ErrorEvent = {
    type: 'error';
    message: string;
};

/**
 * Union of all SSE event types
 */
export type SSEEvent = TokenEvent | DoneEvent | ErrorEvent;

// ============================================================================
// Internal Parsing Types
// ============================================================================

/**
 * Parsed output from agent response after marker extraction.
 * Agents append markers (---PHASE:xxx---, ---JSON---, ---EVALUATION---)
 * which ResponseParser extracts into structured fields.
 */
export interface ParsedAgentOutput {
    userMessage: string;
    phase?: 'phase_1' | 'phase_2';
    jsonData?: {
        field_id?: string;
        field_name?: string;
        field_value?: string | null;
        is_valid?: boolean;
        confidence?: number;
        reason?: string;
        updates?: Array<{
            field_id: string;
            field_name: string;
            field_value: string;
        }>;
    };
    evaluation?: string;
}
