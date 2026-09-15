import Link from 'next/link';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="min-h-dvh-z bg-surface-inverse-deep px-6 py-14 text-ink-inverse">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="mb-10 block bg-gradient-to-b from-ink-inverse to-ink-inverse-muted bg-clip-text text-center font-display text-6xl italic tracking-wide text-transparent"
        >
          HOOPS DRAFT
        </Link>
        <div className="rounded-panel border border-line-inverse bg-surface-inverse p-7 shadow-lg">{children}</div>
      </div>
    </main>
  );
}