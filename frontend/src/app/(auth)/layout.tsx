import Link from 'next/link';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="min-h-screen bg-stone-950 px-6 py-14 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-10 block text-center font-display text-6xl italic tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-white to-stone-400">HOOPS DRAFT</Link>
        <div className="border border-yellow-500/30 bg-stone-900/90 p-7 shadow-[0_0_70px_rgba(234,179,8,0.12)]">{children}</div>
      </div>
    </main>
  );
}