function firstHeaderValue(value: string | null): string {
    return value?.split(',')[0]?.trim() || ''
}

function fallbackProtocol(fallbackOrigin: string): string {
    try {
        return new URL(fallbackOrigin).protocol.replace(':', '')
    } catch {
        return 'http'
    }
}

function normalizeProtocol(protocol: string, fallbackOrigin: string): string {
    if (protocol === 'http' || protocol === 'https') {
        return protocol
    }

    return fallbackProtocol(fallbackOrigin)
}

export function resolveRequestOrigin(headers: Headers, fallbackOrigin: string): string {
    const host = firstHeaderValue(headers.get('x-forwarded-host')) || firstHeaderValue(headers.get('host'))
    if (!host) {
        return fallbackOrigin
    }

    const protocol = normalizeProtocol(firstHeaderValue(headers.get('x-forwarded-proto')), fallbackOrigin)
    // Force HTTPS when behind ALB/proxy to satisfy OAuth TLS requirement
    // Use localhost check to allow HTTP in local dev
    const safeProtocol = host.includes('localhost') || host.startsWith('127.') || host.startsWith('192.168.') ? protocol : 'https'
    return `${safeProtocol}://${host}`
}
