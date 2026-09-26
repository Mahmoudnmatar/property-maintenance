# M0 Decisions

## Technical Stack
- **Framework**: Next.js 15 App Router
- **Database**: PostgreSQL 16 via Prisma 6
- **Auth**: Better Auth with email/password and Prisma adapter
- **i18n**: next-intl for App Router integration (RTL for Arabic)
- **Styling**: Tailwind CSS 4, shadcn/ui

## Reasoning
- **Better Auth**: Lightweight, easy to integrate with Prisma, and supports role-based fields seamlessly.
- **next-intl**: Native support for Server Components and App Router.
- **Prisma**: Excellent type safety and migrations.
