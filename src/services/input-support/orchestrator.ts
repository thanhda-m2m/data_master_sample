import OpenAI from 'openai';
import {ChatMessage, FieldData, ParsedAgentOutput} from './types';
import {PhaseDetector} from './phase-detector';
import {ResponseParser} from './response-parser';
import {SimpleAssistAgent} from './agents/simple-assist-agent';
import {QualityCheckAgent} from './agents/quality-check-agent';
import {buildOrchestratorPrompt} from './prompts/orchestrator-prompt';

/**
 * InputSupportOrchestrator coordinates between phase detection and agent execution.
 * Uses OpenAI function calling to select the appropriate agent based on form state.
 */
export class InputSupportOrchestrator {
    private openai: OpenAI;
    private simpleAssistAgent: SimpleAssistAgent;
    private qualityCheckAgent: QualityCheckAgent;

    constructor(apiKey: string) {
        this.openai = new OpenAI({apiKey});
        this.simpleAssistAgent = new SimpleAssistAgent(this.openai);
        this.qualityCheckAgent = new QualityCheckAgent(this.openai);
    }

    /**
     * Process a user request through the appropriate agent.
     *
     * @param fieldData - Current form field state
     * @param chatHistory - Previous conversation turns
     * @returns Object containing user message, parsed structured data, and current phase
     * @throws Error if OpenAI call fails or tool selection is invalid
     */
    async process(
        fieldData: FieldData[],
        chatHistory: ChatMessage[]
    ): Promise<{
        message: string;
        parsed: ParsedAgentOutput;
        phase: 'phase_1' | 'phase_2';
    }> {
        try {
            const phase = PhaseDetector.determine(fieldData);

            const userMessage = chatHistory.length > 0
                ? chatHistory[chatHistory.length - 1].content
                : 'Help me fill this form';

            const tools: OpenAI.Chat.ChatCompletionTool[] = [
                {
                    type: 'function',
                    function: {
                        name: 'simple_assist_agent',
                        description: 'Data gathering agent for Phase 1 - use when not all required fields are filled',
                        parameters: {
                            type: 'object',
                            properties: {
                                user_message: {
                                    type: 'string',
                                    description: 'The user message to process'
                                }
                            },
                            required: ['user_message']
                        }
                    }
                },
                {
                    type: 'function',
                    function: {
                        name: 'quality_check_agent',
                        description: 'Quality validation agent for Phase 2 - use when all required fields are filled',
                        parameters: {
                            type: 'object',
                            properties: {
                                user_message: {
                                    type: 'string',
                                    description: 'The user message to process'
                                }
                            },
                            required: ['user_message']
                        }
                    }
                }
            ];

            const systemPrompt = buildOrchestratorPrompt(phase, fieldData);

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {role: 'system', content: systemPrompt},
                    {role: 'user', content: userMessage}
                ],
                tools,
                tool_choice: 'required'
            });

            const toolCall = response.choices[0]?.message?.tool_calls?.[0];
            if (!toolCall || toolCall.type !== 'function') {
                throw new Error('No function tool call returned from orchestrator');
            }

            const args = JSON.parse(toolCall.function.arguments);

            let agentOutput: string;

            if (toolCall.function.name === 'simple_assist_agent') {
                agentOutput = await this.simpleAssistAgent.execute(
                    args.user_message,
                    fieldData,
                    chatHistory
                );
            } else if (toolCall.function.name === 'quality_check_agent') {
                agentOutput = await this.qualityCheckAgent.execute(
                    args.user_message,
                    fieldData,
                    chatHistory
                );
            } else {
                throw new Error(`Unknown tool: ${toolCall.function.name}`);
            }

            const parsed = ResponseParser.parse(agentOutput);

            return {
                message: parsed.userMessage,
                parsed,
                phase
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Orchestrator process failed: ${error.message}`);
            }
            throw error;
        }
    }
}
