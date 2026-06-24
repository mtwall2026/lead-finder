import { signOut } from '@/auth';

export default function SignOutPage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-400 text-sm mb-6">Are you sure you want to sign out?</p>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/signin' });
          }}
        >
          <button
            type="submit"
            className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-8 py-3 rounded-lg transition-all duration-200 uppercase tracking-widest text-sm cursor-pointer"
          >
            Sign Out
          </button>
        </form>
      </div>
    </main>
  );
}
