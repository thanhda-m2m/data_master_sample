export const SMARTIMATE_TOKEN_SOURCES = [
    'cognito',
    'smartimate_local',
    'smartimate_impersonation',
] as const

export type SmartiMateTokenSource = typeof SMARTIMATE_TOKEN_SOURCES[number]

export function isSmartiMateTokenSource(value: unknown): value is SmartiMateTokenSource {
    return typeof value === 'string'
        && SMARTIMATE_TOKEN_SOURCES.includes(value as SmartiMateTokenSource)
}
