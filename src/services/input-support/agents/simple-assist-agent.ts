import OpenAI from 'openai';
import {ChatMessage, FieldData} from '../types';
import {buildSimpleAssistPrompt} from '../prompts/simple-assist-prompt';

/**
 * SimpleAssistAgent handles Phase 1 data gathering.
 * Asks user about empty fields one at a time.
 * Returns response with markers: ---PHASE:phase_1--- and ---JSON---
 */
export class SimpleAssistAgent {
    constructor(private openai: OpenAI) {
    }

    /**
     * Execute data gathering conversation.
     *
     * @param userMessage - Latest user input
     * @param fieldData - Current form field state
     * @param chatHistory - Previous conversation turns
     * @returns Raw agent response with markers
     * @throws Error if OpenAI API call fails
     */
    async execute(
        userMessage: string,
        fieldData: FieldData[],
        chatHistory: ChatMessage[]
    ): Promise<string> {
        const systemPrompt = buildSimpleAssistPrompt(fieldData);

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
                temperature: 0.7,
                max_tokens: 500
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No content in OpenAI response');
            }

            return content;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`SimpleAssistAgent execution failed: ${error.message}`);
            }
            throw error;
        }
    }
}
