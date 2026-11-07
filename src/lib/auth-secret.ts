export function authSecret(): Uint8Array {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
    if (secret.length < 32) {
        throw new Error('AUTH_SECRET must contain at least 32 bytes')
    }
    return secret
}
