"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authAttempts, setAuthAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const usernameRegex = /^[a-zA-Z0-9_-]+$/;

  function validate(): string {
    if (!username.trim()) return "Username is required.";
    if (username.trim().length < 3) return "Username must be at least 3 characters.";
    if (!usernameRegex.test(username.trim())) return "Username can only contain letters, numbers, hyphens (-), and underscores (_). No spaces allowed.";
    if (!email.trim()) return "Email address is required.";
    if (!password) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!confirmPassword) return "Please confirm your password.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (Date.now() < cooldownUntil) {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setError(`Too many failed attempts. Please wait ${remaining}s before trying again.`);
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    // Step 1: Check if username already exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (checkError) {
      setError(checkError.message);
      setLoading(false);
      return;
    }

    if (existingProfile) {
      setError("Username already taken.");
      setLoading(false);
      return;
    }

    // Step 2: Sign up with Supabase Auth
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setAuthAttempts((prev) => {
        const next = prev + 1;
        if (next >= 5) {
          setCooldownUntil(Date.now() + 60_000);
          return 0;
        }
        return next;
      });
      if (signUpError.message.toLowerCase().includes("user already registered")) {
        setError("Email already in use.");
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
      return;
    }

    const user = signUpData.user;

    if (!user) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    // Step 3: Insert into profiles table (including email)
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        role: "player",
      });

    if (profileError) {
      // Auth user was created but profile insert failed — sign out so the user
      // can retry cleanly. The orphaned auth account will be recycled on next
      // sign-up attempt with the same email.
      await supabase.auth.signOut();

      if (
        profileError.code === "23505" ||
        profileError.message.toLowerCase().includes("unique") ||
        profileError.message.toLowerCase().includes("duplicate")
      ) {
        setError("Username already taken.");
      } else {
        setError("Account setup failed. Please try again.");
      }
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans flex flex-col">

      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Elite<span className="text-violet-400">MENA</span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Already have an account?</span>
            <a
              href="/sign-in"
              className="text-sm font-medium px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white transition-all duration-200"
            >
              Sign In
            </a>
          </div>
        </div>
      </nav>

      <main className="relative flex flex-1 items-center justify-center px-6 pt-16 pb-12 overflow-hidden">

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
              Join the Arena
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Create your account</h1>
            <p className="mt-2 text-sm text-gray-400">Start competing in tournaments today</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>

              {error && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
                <p className="text-xs text-gray-600 pt-0.5">Saved in lowercase (e.g. "GamerPro" → "gamerpro").</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
                <p className="text-xs text-gray-600 pt-0.5">Must be at least 8 characters long.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>

              <div className="flex items-start gap-3 pt-1">
                <input
                  id="terms"
                  type="checkbox"
                  required
                  className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 focus:ring-1 cursor-pointer shrink-0"
                />
                <label htmlFor="terms" className="text-sm text-gray-400 cursor-pointer select-none leading-relaxed">
                  I agree to the{" "}
                  <a href="#" className="text-violet-400 hover:text-violet-300 transition-colors duration-200">Terms of Service</a>
                  {" "}and{" "}
                  <a href="#" className="text-violet-400 hover:text-violet-300 transition-colors duration-200">Privacy Policy</a>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-violet-900/40 hover:shadow-violet-800/60 mt-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </>
                )}
              </button>

            </form>
          </div>

          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{" "}
            <a href="/sign-in" className="text-violet-400 hover:text-violet-300 transition-colors duration-200 font-medium">
              Sign in
            </a>
          </p>

        </div>
      </main>

    </div>
  );
}