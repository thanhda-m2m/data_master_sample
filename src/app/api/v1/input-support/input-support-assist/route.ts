import {NextRequest} from 'next/server';
import {DoneEvent, ErrorEvent, InputSupportRequestSchema, TokenEvent} from '@/services/input-support/types';
import {InputSupportOrchestrator} from '@/services/input-support/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    let body;
    try {
        const rawBody = await request.json();
        body = InputSupportRequestSchema.parse(rawBody);
    } catch {
        const errorEvent: ErrorEvent = {
            type: 'error',
            message: 'Invalid request format'
        };
        return new Response(
            `data: ${JSON.stringify(errorEvent)}\n\n`,
            {
                status: 400,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache'
                }
            }
        );
    }

    const {field_data, chat_history} = body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        const errorEvent: ErrorEvent = {
            type: 'error',
            message: 'OpenAI API key not configured'
        };
        return new Response(
            `data: ${JSON.stringify(errorEvent)}\n\n`,
            {
                status: 500,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache'
                }
            }
        );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const orchestrator = new InputSupportOrchestrator(apiKey);

                const result = await orchestrator.process(field_data, chat_history);

                for (const char of result.message) {
                    const tokenEvent: TokenEvent = {type: 'token', content: char};
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(tokenEvent)}\n\n`)
                    );
                    await new Promise(resolve => setTimeout(resolve, 20));
                }

                const doneEvent: DoneEvent = {
                    type: 'done',
                    phase: result.phase,
                    structured_data: {}
                };

                if (result.parsed.jsonData) {
                    if (result.phase === 'phase_1') {
                        const {field_id, field_name, field_value} = result.parsed.jsonData;
                        if (field_id && field_name) {
                            doneEvent.structured_data = {
                                field_id,
                                field_name,
                                field_value: field_value ?? undefined
                            };
                        }
                    } else if (result.phase === 'phase_2') {
                        const {field_id, field_name, is_valid, confidence, reason} = result.parsed.jsonData;
                        if (field_id && field_name && typeof is_valid === 'boolean' && typeof confidence === 'number' && reason) {
                            doneEvent.structured_data = {
                                evaluation: {
                                    field_id,
                                    field_name,
                                    is_valid,
                                    confidence,
                                    reason
                                }
                            };
                        }
                    }
                }

                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`)
                );

                controller.close();
            } catch (error) {
                const errorEvent: ErrorEvent = {
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error'
                };
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
                );
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    });
}
