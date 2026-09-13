import Link from 'next/link';
import { LogoutButton } from '../LogoutButton';

export default function PendingPage() {
  return <div className="text-center"><p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-yellow-400">Roster review</p><h1 className="mb-4 font-display text-5xl italic">PENDING APPROVAL</h1><p className="mb-7 text-stone-300">An admin needs to approve your account before you can enter the draft room.</p><LogoutButton /><Link href="/" className="mt-4 block text-sm text-stone-400 hover:text-white">Back to home</Link></div>;
}