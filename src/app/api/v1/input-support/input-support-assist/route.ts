
import {NextRequest} from 'next/server';
import {ErrorEvent, InputSupportRequestSchema} from '@/services/input-support/types';
import {InputSupportOrchestrator} from '@/services/input-support/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
    const origin = request.headers.get('origin');
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
            'Access-Control-Allow-Credentials': 'true'
        }
    });
}

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
                    controller.enqueue(
                        encoder.encode(`event: token\ndata: ${JSON.stringify({token: char})}\n\n`)
                    );
                    await new Promise(resolve => setTimeout(resolve, 20));
                }

                const doneData: any = {
                    ai_message: result.message,
                    update_data: [],
                    next_actions_suggestions: [],
                    quality_results: []
                };

                if (result.parsed.jsonData) {
                    if (result.phase === 'phase_1') {
                        // Phase 1: Handle multiple updates
                        const updates = result.parsed.jsonData.updates;
                        if (Array.isArray(updates) && updates.length > 0) {
                            for (const update of updates) {
                                const {field_id, field_name, field_value} = update;
                                if (field_id && field_name && field_value) {
                                    doneData.update_data.push({
                                        field_id,
                                        field_name,
                                        field_value
                                    });
                                }
                            }
                            if (doneData.update_data.length > 0) {
                                doneData.next_actions_suggestions.push({
                                    label: "反映",
                                    action_id: "apply_updates"
                                });
                            }
                        }
                    } else if (result.phase === 'phase_2') {
                        const {field_id, field_name, is_valid, reason} = result.parsed.jsonData;

                        // Quality check result
                        if (field_id && field_name && typeof is_valid === 'boolean') {
                            doneData.quality_results.push({
                                field_id,
                                field_name,
                                result: is_valid ? "○" : "×",
                                reason: reason || ""
                            });
                        }

                        // Phase 2 can also return multiple updates
                        const updates = result.parsed.jsonData.updates;
                        if (Array.isArray(updates) && updates.length > 0) {
                            for (const update of updates) {
                                const {field_id, field_name, field_value} = update;
                                if (field_id && field_name && field_value) {
                                    doneData.update_data.push({
                                        field_id,
                                        field_name,
                                        field_value
                                    });
                                }
                            }
                            if (doneData.update_data.length > 0) {
                                doneData.next_actions_suggestions.push({
                                    label: "反映",
                                    action_id: "apply_updates"
                                });
                            }
                        }
                    }
                }

                controller.enqueue(
                    encoder.encode(`event: done\ndata: ${JSON.stringify(doneData)}\n\n`)
                );

                controller.close();
            } catch (error) {
                const errorEvent = {
                    message: error instanceof Error ? error.message : 'Unknown error'
                };
                controller.enqueue(
                    encoder.encode(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`)
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
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
            'Access-Control-Allow-Credentials': 'true'
        }
    });
}
