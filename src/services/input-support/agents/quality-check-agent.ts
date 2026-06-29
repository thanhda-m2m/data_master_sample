import OpenAI from 'openai';
import {ChatMessage, FieldData} from '../types';
import {buildQualityCheckPrompt} from '../prompts/quality-check-prompt';

/**
 * QualityCheckAgent handles Phase 2 validation.
 * Reviews filled fields one at a time for correctness and completeness.
 * Returns response with markers: ---PHASE:phase_2---, ---EVALUATION---, and ---JSON---
 */
export class QualityCheckAgent {
    constructor(private openai: OpenAI) {
    }

    /**
     * Execute quality validation conversation.
     *
     * @param userMessage - Latest user input
     * @param fieldData - Current form field state (all required filled)
     * @param chatHistory - Previous conversation turns
     * @returns Raw agent response with markers
     * @throws Error if OpenAI API call fails
     */
    async execute(
        userMessage: string,
        fieldData: FieldData[],
        chatHistory: ChatMessage[]
    ): Promise<string> {
        const systemPrompt = buildQualityCheckPrompt(fieldData);

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            {role: 'system', content: systemPrompt},
            ...chatHistory.map(m => ({
                role: (m.role === 'ai' ? 'assistant' : m.role) as 'user' | 'assistant',
                content: m.content
            })),
            {role: 'user', content: userMessage}
        ];

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages,
                temperature: 0.3,
                max_tokens: 500
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No content in OpenAI response');
            }

            return content;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`QualityCheckAgent execution failed: ${error.message}`);
            }
            throw error;
        }
    }
}
