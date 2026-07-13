import { signOut } from '@/auth';

export default function SignOutPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0047c8 0%, #0057e7 50%, #0069ff 100%)' }}
    >
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
        <p className="text-blue-100/70 text-sm mb-8 tracking-wide">
          Are you sure you want to sign out?
        </p>
        <div className="flex gap-3">
          <a
            href="/"
            className="px-6 py-3 rounded-xl border border-white/30 text-white/80 hover:text-white hover:border-white/60 text-sm font-medium tracking-wide transition-all"
          >
            Cancel
          </a>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/signin' });
            }}
          >
            <button
              type="submit"
              className="px-8 py-3 bg-white text-[#0057e7] font-bold rounded-xl text-sm tracking-wide shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.3)] hover:scale-[1.02] transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </form>
        </div>
        <p className="text-white/80 text-xs mt-6 font-medium">Cirrobound Solutions</p>
      </div>
    </main>
  );
}
