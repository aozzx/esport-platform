"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { FaTwitch, FaYoutube, FaTiktok, FaXTwitter } from "react-icons/fa6";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Change password
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailError, setEmailError] = useState("");

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Social links
  const [twitchUrl, setTwitchUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialSuccess, setSocialSuccess] = useState("");
  const [socialError, setSocialError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/sign-in");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, twitch_url, youtube_url, x_url, tiktok_url")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;
      setUsername(profile?.username ?? null);
      setTwitchUrl(profile?.twitch_url ?? "");
      setYoutubeUrl(profile?.youtube_url ?? "");
      setXUrl(profile?.x_url ?? "");
      setTiktokUrl(profile?.tiktok_url ?? "");
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [supabase, router]);

  async function handleChangePassword(e: React.SyntheticEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!newPassword) { setPasswordError("New password is required."); return; }
    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmNewPassword) { setPasswordError("Passwords do not match."); return; }

    setPasswordLoading(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error("[settings] password update error:", error.message);
      setPasswordError("Failed to update password. Please try again.");
      setPasswordLoading(false);
      return;
    }

    setPasswordSuccess("Password updated successfully.");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordLoading(false);
    setTimeout(() => setPasswordSuccess(""), 3000);
  }

  async function handleChangeEmail(e: React.SyntheticEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailSuccess("");

    const trimmed = newEmail.trim();
    if (!trimmed) { setEmailError("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setEmailLoading(true);

    const { error } = await supabase.auth.updateUser({ email: trimmed });

    if (error) {
      console.error("[settings] email update error:", error.message);
      setEmailError("Failed to update email. Please try again.");
      setEmailLoading(false);
      return;
    }

    setEmailSuccess("Confirmation sent to your new email. Please check your inbox.");
    setNewEmail("");
    setEmailLoading(false);
    setTimeout(() => setEmailSuccess(""), 5000);
  }

  const SOCIAL_DOMAINS: Record<string, string[]> = {
    twitch_url:  ["twitch.tv", "www.twitch.tv"],
    youtube_url: ["youtube.com", "www.youtube.com", "youtu.be"],
    x_url:       ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
    tiktok_url:  ["tiktok.com", "www.tiktok.com"],
  };

  function validateSocialUrl(field: string, url: string): string | null {
    if (!url.trim()) return null;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "https:") return "Must be an https:// link.";
      if (!(SOCIAL_DOMAINS[field] ?? []).includes(parsed.hostname)) return "Invalid domain.";
      return null;
    } catch {
      return "Invalid URL.";
    }
  }

  async function handleSaveSocialLinks(e: React.SyntheticEvent) {
    e.preventDefault();
    setSocialError("");
    setSocialSuccess("");

    const fields: [string, string, string][] = [
      ["twitch_url",  "Twitch",  twitchUrl],
      ["youtube_url", "YouTube", youtubeUrl],
      ["x_url",       "X",       xUrl],
      ["tiktok_url",  "TikTok",  tiktokUrl],
    ];

    for (const [key, label, value] of fields) {
      const err = validateSocialUrl(key, value);
      if (err) { setSocialError(`${label}: ${err}`); return; }
    }

    setSocialLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSocialLoading(false); return; }

    const { error } = await supabase
      .from("profiles")
      .update({
        twitch_url:  twitchUrl.trim()  || null,
        youtube_url: youtubeUrl.trim() || null,
        x_url:       xUrl.trim()       || null,
        tiktok_url:  tiktokUrl.trim()  || null,
      })
      .eq("id", user.id);

    if (error) {
      setSocialError("Failed to save. Please try again.");
      setSocialLoading(false);
      return;
    }

    setSocialSuccess("Social links saved.");
    setSocialLoading(false);
    setTimeout(() => setSocialSuccess(""), 3000);
  }

  async function handleDeleteAccount(e: React.SyntheticEvent) {
    e.preventDefault();
    setDeleteError("");

    if (deleteConfirm !== "DELETE") {
      setDeleteError("Please type DELETE to confirm.");
      return;
    }

    setDeleteLoading(true);

    const res = await fetch("/api/delete-account", { method: "POST" });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[settings] delete account error:", body.error);
      setDeleteError("Failed to delete account. Please try again.");
      setDeleteLoading(false);
      return;
    }

    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-3xl mx-auto px-6 pt-28 pb-20 space-y-6">

        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account preferences</p>
        </div>

        {/* Change Password */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Change Password
          </h2>
          <p className="text-xs text-gray-500 mb-4">Update your account password</p>

          {passwordSuccess && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {passwordSuccess}
            </div>
          )}

          {passwordError && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {passwordError}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3">
            <input
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
            />
            <button
              type="submit"
              disabled={passwordLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
            >
              {passwordLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : "Update Password"}
            </button>
          </form>
        </div>

        {/* Change Email */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Change Email
          </h2>
          <p className="text-xs text-gray-500 mb-4">Update the email linked to your account</p>

          {emailSuccess && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {emailSuccess}
            </div>
          )}

          {emailError && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {emailError}
            </div>
          )}

          <form onSubmit={handleChangeEmail} className="space-y-3">
            <input
              type="email"
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
            />
            <button
              type="submit"
              disabled={emailLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
            >
              {emailLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : "Update Email"}
            </button>
          </form>
        </div>

        {/* Social Links */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Social Links
          </h2>
          <p className="text-xs text-gray-500 mb-4">Add your social media profiles — only https:// links from official domains are accepted</p>

          {socialSuccess && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {socialSuccess}
            </div>
          )}

          {socialError && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {socialError}
            </div>
          )}

          <form onSubmit={handleSaveSocialLinks} className="space-y-3">
            {([
              { key: "twitch",  icon: <FaTwitch  className="w-4 h-4 text-purple-400" />, label: "Twitch",  value: twitchUrl,  set: setTwitchUrl,  placeholder: "https://twitch.tv/yourname"     },
              { key: "youtube", icon: <FaYoutube  className="w-4 h-4 text-red-400"    />, label: "YouTube", value: youtubeUrl, set: setYoutubeUrl, placeholder: "https://youtube.com/@yourchannel" },
              { key: "x",       icon: <FaXTwitter className="w-4 h-4 text-white"      />, label: "X",       value: xUrl,       set: setXUrl,       placeholder: "https://x.com/yourhandle"       },
              { key: "tiktok",  icon: <FaTiktok   className="w-4 h-4 text-cyan-400"   />, label: "TikTok",  value: tiktokUrl,  set: setTiktokUrl,  placeholder: "https://tiktok.com/@yourname"   },
            ] as { key: string; icon: React.ReactNode; label: string; value: string; set: (v: string) => void; placeholder: string }[]).map(({ key, icon, label, value, set, placeholder }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  {icon}
                </div>
                <input
                  type="url"
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  aria-label={label}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200"
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={socialLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
            >
              {socialLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : "Save Social Links"}
            </button>
          </form>
        </div>

        {/* Delete Account */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
          <h2 className="text-sm font-semibold text-red-400 mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete Account
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>

          {deleteError && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {deleteError}
            </div>
          )}

          <form onSubmit={handleDeleteAccount} className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-2">
                Type <span className="text-red-400 font-mono font-bold">DELETE</span> to confirm
              </p>
              <input
                type="text"
                placeholder="Type DELETE to confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-red-500/20 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors duration-200"
              />
            </div>
            <button
              type="submit"
              disabled={deleteLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200"
            >
              {deleteLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : "Delete My Account"}
            </button>
          </form>
        </div>

      </main>
    </div>
  );
}