import {NextRequest} from 'next/server';
import {DoneEvent, ErrorEvent, InputSupportRequestSchema, TokenEvent} from '@/services/input-support/types';
import {InputSupportOrchestrator} from '@/services/input-support/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    // Handle CORS preflight
    const origin = request.headers.get('origin');
    const corsHeaders = {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
        'Access-Control-Allow-Credentials': 'true'
    };

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
                        encoder.encode(`event: token\ndata: ${JSON.stringify({token: char})}\n\n`)
                    );
                    await new Promise(resolve => setTimeout(resolve, 20));
                }

                // Build done event response matching requirement spec
                const doneData = {
                    ai_message: result.message,
                    update_data: [] as any[],
                    next_actions_suggestions: [] as any[],
                    quality_results: [] as any[]
                };

                if (result.parsed.jsonData) {
                    if (result.phase === 'phase_1') {
                        const {field_id, field_name, field_value} = result.parsed.jsonData;
                        if (field_id && field_name) {
                            doneData.update_data.push({
                                field_id,
                                field_name,
                                field_value: field_value ?? null
                            });
                            doneData.next_actions_suggestions.push({
                                label: "反映",
                                action_id: "apply_updates"
                            });
                        }
                    } else if (result.phase === 'phase_2') {
                        const {field_id, field_name, is_valid, confidence, reason} = result.parsed.jsonData;
                        if (field_id && field_name && typeof is_valid === 'boolean') {
                            doneData.quality_results.push({
                                field_id,
                                field_name,
                                result: is_valid ? "○" : "×",
                                reason: reason || ""
                            });
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
            ...corsHeaders
        }
    });
}

// Handle OPTIONS for CORS preflight
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
