type RateLimitRecord = {
    count: number
    resetAt: number
}

const rateLimitMap = new Map<string, RateLimitRecord>()

export function checkRateLimit(
    key: string,
    limit: number,
    windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const record = rateLimitMap.get(key)

    if (!record || record.resetAt <= now) {
        const next = {count: 1, resetAt: now + windowMs}
        rateLimitMap.set(key, next)
        return {allowed: true, remaining: limit - 1, resetAt: next.resetAt}
    }

    if (record.count >= limit) {
        return {allowed: false, remaining: 0, resetAt: record.resetAt}
    }

    record.count += 1
    return {allowed: true, remaining: Math.max(0, limit - record.count), resetAt: record.resetAt}
}

export function resetRateLimitStore() {
    rateLimitMap.clear()
}
