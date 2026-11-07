# DataMaster app-switch sample

Next.js 16 sample for normal-user SSO between iMATE and DataMaster. Each app uses a **different Cognito app client in the same tenant user pool**. Cognito's Hosted UI browser session supplies SSO; neither app passes its tokens to the other.

## Local setup

1. Start the iMATE web and database services at `http://localhost:8080` and port `3306`.
2. Run `npm ci` in this directory.
3. Copy `.env.example` to `.env.local`. Generate `AUTH_SECRET` with `openssl rand -hex 32` and configure the tenant's separate DataMaster client in `DATAMASTER_COGNITO_CLIENTS`.
4. Register `http://localhost:3000/api/auth/callback` as that client's Cognito callback, enable authorization-code flow, and allow `openid email profile` scopes. The client must be confidential, with a client secret.
5. Run `npm run dev` and open `http://localhost:3000/thanhda`.

The local `thanhda` environment uses its existing DataMaster Cognito client; its secret remains in ignored `.env.local`. No change to iMATE's `bkmasters.cognito_credentials` JSON is required.

## Configuration

- `DATAMASTER_CALLBACK_URL`: exact callback sent to Cognito during authorization and code exchange. Its origin is also used for redirects and cookie security. HTTP localhost is supported; DataMaster does not replace the configured scheme with HTTPS.
- `DATAMASTER_COGNITO_CLIENTS`: server-only JSON object keyed by lowercase tenant code, each containing `client_id` and `client_secret`. These are **DataMaster** credentials, not iMATE's browser or M2M credentials.
- `AUTH_SECRET`: at least 32 random bytes, used to sign OAuth state and DataMaster's local sessions.
- `SMARTIMATE_BASE_URL`: browser-facing iMATE address, used only for the button that returns to iMATE.
- `HZ_TAK_DB_HOST`, `HZ_TAK_DB_PORT`, `HZ_TAK_DB_NAME`, `HZ_TAK_DB_USER`, `HZ_TAK_DB_PASSWORD`: connection to the shared central database. The resolver joins `buscomps` and `bkmasters` to read the tenant's `userPoolId`, `cognito_region`, and `cognito_custom_domain`.

Keep `.env.local` out of source control. The resolver never falls back to iMATE's credentials or to a placeholder Hosted UI domain. Isolated authentication and administrator impersonation are not supported by this sample's app-switch flow.

## Header switching

Set iMATE's `DIGITAL_MASTER_DOMAIN=http://localhost:3000`. Its existing header button opens:

```text
http://localhost:3000/{tenant}?rs=1
```

`rs=1` always starts a fresh DataMaster authorization-code flow against Cognito, even if DataMaster already has a session. This avoids retaining a different local user when switching identities in iMATE. A valid Cognito browser session skips another password/MFA sign-in; otherwise Cognito presents the pool's configured sign-in and MFA screens. The callback returns to `/{tenant}` without `rs`, so it does not loop.

The flow uses PKCE S256, signed state bound to HttpOnly cookies, an OIDC nonce, and RS256 ID-token verification against the tenant pool's JWKS. Issuer, app-client audience, token use, expiry, and `custom:tenant_id` must match. Tokens are exchanged server-side; Cognito ID/access/refresh tokens are not stored in browser cookies or returned by the session API. The local identity session expires with the verified Cognito ID token.

The DataMaster dashboard's iMATE button navigates to `SMARTIMATE_BASE_URL/login?k={tenant}`. That starts iMATE's own Hosted UI authorization; it does not hand off a token or assume an existing HZCOG session is the current Cognito user. No iMATE OAuth broker, UserInfo, or validation endpoint is used.

DataMaster sign-out clears its local session and tenant cookie and returns to the tenant greeting. iMATE logout first commits revocation of that iMATE SQL session, attempts revocation of that session's refresh token, and then visits Cognito's browser logout. Provider failure does not restore the SQL session. DataMaster's local session is not cleared by iMATE logout, and iMATE's SQL session is not cleared by DataMaster logout. Cognito browser logout ends the shared Hosted UI SSO session; it is not a global sign-out of a separate upstream IdP.

## Checks

```sh
npm test
npx tsc --noEmit
npm run build
```
