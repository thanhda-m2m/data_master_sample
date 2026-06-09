import Link from 'next/link'

const errorMessages: Record<string, { title: string; message: string; action: string; actionHref: string }> = {
  Configuration: {
    title: 'Configuration Error',
    message: 'Authentication service is misconfigured. Please contact support.',
    action: 'Contact Support',
    actionHref: '/',
  },
  AccessDenied: {
    title: 'Access Denied',
    message: 'You do not have permission to access this application.',
    action: 'Try Again',
    actionHref: '/',
  },
  Verification: {
    title: 'Verification Required',
    message: 'Email or phone verification is required. Check your inbox for a verification code.',
    action: 'Try Again',
    actionHref: '/',
  },
  InvalidTenant: {
    title: 'Invalid Tenant',
    message: 'The tenant subdomain is invalid or disabled. Check the URL and try again.',
    action: 'Go Home',
    actionHref: '/',
  },
  InvalidCallback: {
    title: 'Invalid Redirect',
    message: 'The redirect URL is not allowed. This may be a security issue.',
    action: 'Go Home',
    actionHref: '/',
  },
  RefreshAccessTokenError: {
    title: 'Session Expired',
    message: 'Your session has expired. Please log in again.',
    action: 'Log In',
    actionHref: '/api/auth/signin',
  },
  invalid_state: {
    title: 'Authentication Failed',
    message: 'Invalid authentication state. Please try again.',
    action: 'Try Again',
    actionHref: '/',
  },
  invalid_client: {
    title: 'OAuth Client Not Registered',
    message: 'DataMaster is not registered as an OAuth client in Smart iMATE.',
    action: 'Try Again',
    actionHref: '/',
  },
  tenant_not_found: {
    title: 'Tenant Not Found',
    message: 'Tenant configuration not found.',
    action: 'Go Home',
    actionHref: '/',
  },
  token_exchange_failed: {
    title: 'Authentication Failed',
    message: 'Failed to complete authentication. Please try again.',
    action: 'Try Again',
    actionHref: '/',
  },
  internal_error: {
    title: 'Internal Error',
    message: 'An internal error occurred. Please try again or contact support.',
    action: 'Try Again',
    actionHref: '/',
  },
  Default: {
    title: 'Authentication Failed',
    message: 'An error occurred during authentication. Please try again or contact support.',
    action: 'Try Again',
    actionHref: '/',
  },
}

export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const errorCode = params.error || 'Default'
  const error = errorMessages[errorCode] || errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">{error.title}</h1>
        <p className="text-gray-700 mb-6">{error.message}</p>
        <div className="space-y-2">
          <Link
            href={error.actionHref}
            className="block text-center bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            {error.action}
          </Link>
          <Link
            href="/"
            className="block text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Return to Home
          </Link>
        </div>
        {errorCode !== 'Default' && (
          <p className="mt-6 text-center text-xs text-gray-400">Error code: {errorCode}</p>
        )}
      </div>
    </div>
  )
}
