"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authAttempts, setAuthAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function trackFailedAttempt() {
    setAuthAttempts((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setCooldownUntil(Date.now() + 60_000);
        return 0;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (Date.now() < cooldownUntil) {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setError(`Too many failed attempts. Please wait ${remaining}s before trying again.`);
      return;
    }

    setLoading(true);

    let emailToUse = identifier.trim();

    if (!isEmail(emailToUse)) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("username", emailToUse.toLowerCase())
        .maybeSingle();

      if (profileError || !profile?.email) {
        trackFailedAttempt();
        setError("Invalid username or password.");
        setLoading(false);
        return;
      }

      emailToUse = profile.email;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });

    if (signInError) {
      trackFailedAttempt();
      setError("Invalid username or password.");
      setLoading(false);
      return;
    }

    setAuthAttempts(0);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans flex flex-col">

      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-1.5 group hover:opacity-90 transition-opacity duration-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/elitemena-icon-512.png"
              alt=""
              width={36}
              height={36}
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain flex-shrink-0"
            />
            <span className="text-base sm:text-lg font-bold tracking-tight leading-none">
              <span className="text-white">Elite</span>
              <span className="text-violet-400">MENA</span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Don't have an account?</span>
            <a
              href="/sign-up"
              className="text-sm font-medium px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors duration-200"
            >
              Sign Up
            </a>
          </div>
        </div>
      </nav>

      <main className="relative flex flex-1 items-center justify-center px-6 pt-16 overflow-hidden">

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/15 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[250px] h-[250px] bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-1/4 w-[250px] h-[250px] bg-fuchsia-600/10 rounded-full blur-3xl" />
        </div>

        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative w-full max-w-md">

          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium tracking-wide uppercase mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Welcome Back
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Sign in to EliteMENA</h1>
            <p className="mt-2 text-sm text-gray-400">Enter your credentials to access your account</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
            <form onSubmit={handleSubmit} className="space-y-5">

              {error && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="identifier" className="block text-sm font-medium text-gray-300">
                  Email or Username
                </label>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-violet-900/40 hover:shadow-violet-800/60"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </>
                )}
              </button>

            </form>
          </div>

          <p className="text-center text-xs text-gray-600 mt-6">
            By signing in, you agree to our{" "}
            <a href="#" className="text-gray-500 hover:text-gray-400 underline underline-offset-2 transition-colors duration-200">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-gray-500 hover:text-gray-400 underline underline-offset-2 transition-colors duration-200">
              Privacy Policy
            </a>
          </p>

        </div>
      </main>

    </div>
  );
}