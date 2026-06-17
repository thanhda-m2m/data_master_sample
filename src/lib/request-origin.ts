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
  return `${protocol}://${host}`
}
