This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Smart iMATE Network Routing

Use separate public and private addresses when DataMaster and Smart iMATE share a VPC:

```text
SMARTIMATE_BASE_URL=https://smartimate.example.com
SMARTIMATE_INTERNAL_BASE_URL=http://10.0.12.34:8080
```

Browser login redirects use `SMARTIMATE_BASE_URL`. DataMaster backend token exchange and validation use `SMARTIMATE_INTERNAL_BASE_URL`.

`SMARTIMATE_TOKEN_URL` and `SMARTIMATE_VALIDATE_URL` can still override individual backend endpoints. If the internal base is unset, backend calls fall back to the public base.

## Tenant Dashboard Routes

Authenticated users land on a path-based tenant dashboard:

```text
https://data-master.example.com/{tenantCode}
```

When a user opens `/{tenantCode}` without a session, or with a session for another tenant, DataMaster immediately starts SSO for that tenant and returns to the same tenant path after login.

`/dashboard` is kept as a compatibility entry point and redirects to the signed-in user's tenant path.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
