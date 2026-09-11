import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center mb-16">
        <h1 className="text-8xl tracking-tight text-stone-800 leading-none mb-3" style={{ fontFamily: 'var(--font-bebas)' }}>
          HOOPS DRAFT
        </h1>
        <p className="text-stone-400 font-medium tracking-wide text-sm">
          The Ultimate Basketball TCG Experience
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <Link href="/draft" className="group w-full flex items-center justify-center py-5 rounded-2xl bg-stone-800 text-white shadow-md hover:shadow-xl transition-all hover:scale-[1.02] hover:bg-stone-700">
          <span className="font-semibold text-lg tracking-wide">Start New Draft</span>
        </Link>
        
        <Link href="/deckbuilder-test" className="group w-full flex items-center justify-center py-4 rounded-xl bg-white border border-stone-200 text-stone-600 shadow-sm hover:shadow-md transition-all hover:scale-[1.02] hover:border-stone-300">
          <span className="font-medium tracking-wide">Deckbuilder (Random)</span>
        </Link>
        
        <Link href="/rosters" className="group w-full flex items-center justify-center py-4 rounded-xl bg-white border border-stone-200 text-stone-600 shadow-sm hover:shadow-md transition-all hover:scale-[1.02] hover:border-stone-300">
          <span className="font-medium tracking-wide">My Rosters</span>
        </Link>
        
        <Link href="/data" className="group w-full flex items-center justify-center py-3 rounded-lg text-stone-400 hover:text-stone-600 transition-colors">
          <span className="font-medium text-sm tracking-wide">Data Viewer</span>
        </Link>
      </div>
    </main>
  );
}
