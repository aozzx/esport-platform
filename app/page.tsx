import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/Navbar";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [username, activeSeason, playerCount, tournamentCount, teamCount] = await Promise.all([
    user
      ? supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle()
          .then((r) => r.data?.username ?? null)
      : Promise.resolve(null),
    supabase
      .from("seasons")
      .select("name")
      .eq("status", "active")
      .maybeSingle()
      .then((r) => r.data as { name: string } | null),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .then((r) => r.count ?? 0),
    supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .then((r) => r.count ?? 0),
    supabase
      .from("teams")
      .select("id", { count: "exact", head: true })
      .then((r) => r.count ?? 0),
  ]);

  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-[#03030a] text-white font-sans">
      <Navbar username={username} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <main className="relative min-h-screen overflow-hidden">

        {/* Static background glow — no animation */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(109,40,217,0.12) 0%, transparent 70%), " +
              "radial-gradient(ellipse 50% 40% at 15% 60%, rgba(79,70,229,0.07) 0%, transparent 60%)",
          }}
        />

        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            opacity: 0.016,
            maskImage:
              "radial-gradient(ellipse 55% 65% at 32% 44%, black 15%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 55% 65% at 32% 44%, black 15%, transparent 100%)",
          }}
        />

        {/* Hero content — asymmetric two-column */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-40 pb-24 flex flex-col lg:flex-row lg:items-center lg:gap-16">

          {/* Left column: text */}
          <div className="flex-1 min-w-0">

            {/* Live badge */}
            <div className="animate-fade-up mb-10">
              {activeSeason ? (
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-[11px] font-bold tracking-[0.16em] uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  {activeSeason.name} — Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] text-gray-500 text-[11px] font-bold tracking-[0.16em] uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Now Open · MENA Region
                </span>
              )}
            </div>

            {/* Headline with left border accent */}
            <div
              className="animate-fade-up border-l-[3px] border-violet-500 pl-7"
              style={{ animationDelay: "80ms" }}
            >
              <h1 className="text-[3.2rem] sm:text-[4.2rem] md:text-[5.2rem] lg:text-[5.8rem] font-black tracking-tight leading-[0.93]">
                <span className="block text-gray-400 text-[0.38em] font-extrabold tracking-[0.3em] uppercase mb-3 pl-0.5">
                  The
                </span>
                <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-300 to-indigo-400 bg-clip-text text-transparent">
                  MENA
                </span>
                <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-300 to-indigo-400 bg-clip-text text-transparent">
                  ARENA
                </span>
                <span className="block text-white mt-1.5">IS OPEN.</span>
              </h1>
            </div>

            {/* Subtext */}
            <p
              className="animate-fade-up mt-9 max-w-[400px] text-[15px] text-gray-500 leading-relaxed"
              style={{ animationDelay: "160ms" }}
            >
              Real tournaments. Real competition. Built for players across MENA. EliteMENA is where MENA&rsquo;s top players prove themselves.
            </p>

            {/* CTAs */}
            <div
              className="animate-fade-up mt-10 flex flex-col sm:flex-row items-start gap-5"
              style={{ animationDelay: "240ms" }}
            >
              <a
                href={isLoggedIn ? "/tournaments" : "/sign-up"}
                className="group relative inline-flex items-center gap-3 px-8 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm tracking-wide transition-all duration-200 shadow-lg shadow-violet-950/60 hover:shadow-[0_0_32px_rgba(139,92,246,0.5)] hover:scale-[1.03] active:scale-[0.98]"
              >
                <span className="relative z-10 flex items-center gap-3">
                  Enter the Arena
                  <svg
                    className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </a>
              <a
                href="/tournaments"
                className="group inline-flex items-center gap-2 py-3.5 text-gray-500 hover:text-violet-300 font-semibold text-sm tracking-wide transition-colors duration-200"
              >
                Browse Tournaments
                <svg
                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>

            {/* Stats row with pipe dividers */}
            <div
              className="animate-fade-up mt-14 flex items-center"
              style={{ animationDelay: "320ms" }}
            >
              {[
                { value: playerCount > 0 ? `${playerCount}+` : "—", label: "Players" },
                { value: tournamentCount > 0 ? `${tournamentCount}+` : "—", label: "Tournaments" },
                { value: teamCount > 0 ? `${teamCount}+` : "—", label: "Teams" },
              ].map(({ value, label }, i) => (
                <div key={label} className="flex items-center">
                  {i > 0 && <div className="w-px h-8 bg-white/[0.07] mx-8" />}
                  <div>
                    <div className="text-2xl font-black text-white tracking-tight">{value}</div>
                    <div className="mt-0.5 text-[10px] font-bold text-gray-700 uppercase tracking-[0.18em]">
                      {label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: rotating crosshair */}
          <div className="hidden lg:flex flex-shrink-0 items-center justify-center w-[360px] h-[360px] relative mt-8 lg:mt-0">
            <div className="absolute inset-0 rounded-full bg-violet-700/[0.05] blur-3xl" />
            <svg
              className="w-[280px] h-[280px] opacity-35"
              viewBox="0 0 120 120"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="60" cy="60" r="54" stroke="rgba(139,92,246,0.55)" strokeWidth="0.5" />
              <circle cx="60" cy="60" r="40" stroke="rgba(139,92,246,0.35)" strokeWidth="0.45" />
              <circle cx="60" cy="60" r="20" stroke="rgba(139,92,246,0.65)" strokeWidth="0.7" />
              <circle cx="60" cy="60" r="5" stroke="rgba(139,92,246,0.8)" strokeWidth="0.8" fill="none" />
              <circle cx="60" cy="60" r="1.5" fill="rgba(139,92,246,0.95)" />
              {/* Cardinal lines */}
              <line x1="60" y1="0" x2="60" y2="37" stroke="rgba(139,92,246,0.65)" strokeWidth="0.6" />
              <line x1="60" y1="83" x2="60" y2="120" stroke="rgba(139,92,246,0.65)" strokeWidth="0.6" />
              <line x1="0" y1="60" x2="37" y2="60" stroke="rgba(139,92,246,0.65)" strokeWidth="0.6" />
              <line x1="83" y1="60" x2="120" y2="60" stroke="rgba(139,92,246,0.65)" strokeWidth="0.6" />
              {/* Gap markers on outer ring */}
              <line x1="54" y1="6.5" x2="56" y2="6.5" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
              <line x1="64" y1="6.5" x2="66" y2="6.5" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
              <line x1="54" y1="113.5" x2="56" y2="113.5" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
              <line x1="64" y1="113.5" x2="66" y2="113.5" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
              <line x1="6.5" y1="54" x2="6.5" y2="56" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
              <line x1="6.5" y1="64" x2="6.5" y2="66" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
              <line x1="113.5" y1="54" x2="113.5" y2="56" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
              <line x1="113.5" y1="64" x2="113.5" y2="66" stroke="rgba(139,92,246,0.4)" strokeWidth="0.5" />
            </svg>
            {/* Static center glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3 h-3 rounded-full bg-violet-500/50 shadow-[0_0_16px_5px_rgba(139,92,246,0.35)]" />
            </div>
          </div>
        </div>
      </main>

      {/* ── Manifesto strip ──────────────────────────────────────────── */}
      <div className="relative border-y border-white/[0.04] py-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-950/25 via-transparent to-violet-950/25 pointer-events-none" />
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="flex items-center gap-5 mb-7">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-violet-500/25" />
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500/50" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-violet-500/25" />
          </div>
          <p className="text-xl sm:text-2xl font-bold italic text-gray-400 leading-snug tracking-tight">
            &ldquo;Not every server has stakes.{" "}
            <span className="text-white not-italic font-black">Ours do.&rdquo;</span>
          </p>
          <p className="mt-4 text-[12px] text-gray-700 font-semibold tracking-[0.18em] uppercase">
            EliteMENA — Built for competitors, not casuals.
          </p>
          <div className="flex items-center gap-5 mt-7">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-violet-500/15" />
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500/30" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-violet-500/15" />
          </div>
        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-28">

        {/* Section header */}
        <div className="mb-16">
          <p className="text-[11px] font-bold text-violet-500 uppercase tracking-[0.22em] mb-4">
            Platform
          </p>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight max-w-xs leading-tight">
            Built around the compete.
          </h2>
        </div>

        {/* Editorial numbered features */}
        <div>
          {[
            {
              num: "01",
              title: "Team Management",
              description:
                "Build your squad, invite players, and assign roles. Your roster is your foundation — manage it like a pro org.",
            },
            {
              num: "02",
              title: "Ranked Tournaments",
              description:
                "Structured brackets. Real stakes. Every match counts toward your seasonal ranking across the region.",
            },
            {
              num: "03",
              title: "Live Leaderboards",
              description:
                "Real-time standings and match history tracked across every season. Know exactly where you stand — always.",
            },
          ].map(({ num, title, description }) => (
            <div
              key={num}
              className="group flex items-start gap-8 sm:gap-12 py-10 border-b border-white/[0.05] hover:border-violet-500/20 transition-colors duration-300"
            >
              {/* Number */}
              <span className="flex-shrink-0 text-[3.2rem] font-black leading-none text-violet-500/[0.1] group-hover:text-violet-500/[0.18] transition-colors duration-300 w-16 sm:w-20 text-right select-none">
                {num}
              </span>
              {/* Content */}
              <div className="flex-1 pt-1.5">
                <h3 className="text-base font-bold text-white mb-2 group-hover:text-violet-200 transition-colors duration-300 tracking-tight">
                  {title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed max-w-md group-hover:text-gray-500 transition-colors duration-300">
                  {description}
                </p>
              </div>
              {/* Arrow */}
              <div className="hidden sm:block flex-shrink-0 pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <svg
                  className="w-5 h-5 text-violet-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom text CTA */}
        <div className="mt-16 flex items-center gap-6">
          <a
            href={isLoggedIn ? "/tournaments" : "/sign-up"}
            className="group inline-flex items-center gap-2 text-sm font-bold text-violet-500 hover:text-violet-300 tracking-wide transition-colors duration-200"
          >
            {isLoggedIn ? "Go to Tournaments" : "Create your account"}
            <svg
              className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
          <div className="flex-1 h-px bg-white/[0.03]" />
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-600">
              Elite<span className="text-violet-600">MENA</span>
            </span>
          </div>
          <p className="text-xs text-gray-700">
            © {new Date().getFullYear()} EliteMENA. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
