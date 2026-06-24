import { signIn } from '@/auth';

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <img src="/logo.png" alt="Cirrobound" className="h-28 w-auto mx-auto mb-8" />
        <h1
          className="text-3xl font-bold tracking-widest uppercase mb-2 text-white"
          style={{ textShadow: '0 0 24px rgba(26,53,208,0.75)' }}
        >
          Lead Finder
        </h1>
        <p className="text-slate-400 text-sm mb-8">
          Sign in with your Cirrobound Microsoft account to continue.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('microsoft-entra-id', { redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="bg-[#1a35d0] hover:bg-[#2a4ae0] text-white font-bold px-8 py-3 rounded-lg transition-all duration-200 uppercase tracking-widest text-sm shadow-[0_0_24px_rgba(26,53,208,0.45)] hover:shadow-[0_0_36px_rgba(26,53,208,0.7)] cursor-pointer"
          >
            Sign in with Microsoft
          </button>
        </form>
      </div>
    </main>
  );
}
