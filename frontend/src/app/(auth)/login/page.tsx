import { AuthForm } from '../AuthForm';

export default function LoginPage() {
  return (
    <>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-accent">Welcome back</p>
      <h1 className="mb-7 font-display text-5xl italic">SIGN IN</h1>
      <AuthForm mode="login" />
    </>
  );
}
