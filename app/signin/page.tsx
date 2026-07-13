import { signIn } from '@/auth';

export default function SignInPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0047c8 0%, #0057e7 50%, #0069ff 100%)' }}
    >
      {/* Card */}
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl px-12 py-10 flex flex-col items-center shadow-[0_8px_48px_rgba(0,0,0,0.3)]" style={{ minWidth: 360 }}>
        <img
          src="/logo.png"
          alt="Cirrobound"
          className="h-24 w-auto mb-6"
          style={{ mixBlendMode: 'screen' }}
        />
        <h1 className="text-white font-bold text-2xl tracking-widest uppercase mb-1">
          Lead Finder
        </h1>
        <p className="text-white/90 text-sm mb-8 tracking-wide font-medium">
          Cirrobound Solutions
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('microsoft-entra-id', { redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="flex items-center gap-3 bg-white text-[#0057e7] font-bold px-8 py-3.5 rounded-xl transition-all duration-200 text-sm tracking-wide shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.3)] hover:scale-[1.02] cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Sign in with Microsoft
          </button>
        </form>
        <p className="text-white/70 text-xs mt-6">
          Use your @cirrobound.com account
        </p>
      </div>
    </main>
  );
}
