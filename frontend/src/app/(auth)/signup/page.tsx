import { AuthForm } from '../AuthForm';

export default function SignupPage() {
  return (
    <>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-accent">Join the league</p>
      <h1 className="mb-7 font-display text-5xl italic">SIGN UP</h1>
      <AuthForm mode="signup" />
    </>
  );
}
