"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

type UserRow = {
  id: string;
  username: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "owner") { router.push("/"); return; }

      setCurrentUserId(user.id);
      setUsername(profile.username);

      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, username, email, role, created_at")
        .order("created_at", { ascending: false });

      setUsers(usersData ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }

  function showError(msg: string) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  }

  async function handleRoleChange(userId: string, newRole: string) {
    // Server-side guards — these mirror the RLS policy and catch misuse
    // before a round-trip to the database.
    if (newRole === "owner") {
      showError("The owner role cannot be assigned.");
      return;
    }
    if (userId === currentUserId) {
      showError("You cannot change your own role.");
      return;
    }
    const target = users.find((u) => u.id === userId);
    if (target?.role === "owner") {
      showError("The owner role cannot be changed.");
      return;
    }

    setUpdatingId(userId);

    // Re-verify the caller is still authenticated and still an owner before
    // sending the mutation. Guards against session changes after page load.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/sign-in"); return; }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (callerProfile?.role !== "owner") {
      showError("You no longer have permission to change roles.");
      setUpdatingId(null);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      console.error("[admin users] role update error:", error.code, error.message);
      showError("Failed to update role.");
    } else {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
      await supabase.from("admin_audit_log").insert({
        actor_id: user.id,
        action: "role_change",
        target_id: userId,
        details: { new_role: newRole, previous_role: target?.role ?? null },
      });
      showSuccess("Role updated.");
    }
    setUpdatingId(null);
  }

  const filtered = users.filter((u) =>
    !search.trim() ||
    (u.username ?? "").toLowerCase().includes(search.trim().toLowerCase())
  );

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function roleBadgeClass(role: string | null) {
    switch (role) {
      case "owner": return "bg-yellow-500/15 border-yellow-500/30 text-yellow-400";
      case "admin": return "bg-violet-500/15 border-violet-500/30 text-violet-400";
      default:      return "bg-gray-500/15 border-gray-500/30 text-gray-400";
    }
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

      <main className="max-w-5xl mx-auto px-6 pt-28 pb-20 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium tracking-wide uppercase mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Owner
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Users</h1>
            <p className="text-sm text-gray-500 mt-1">{users.length} registered {users.length === 1 ? "user" : "users"}</p>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username..."
              className="pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors duration-200 w-64"
            />
          </div>
        </div>

        {/* Banners */}
        {successMsg && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {errorMsg}
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <p className="text-sm text-gray-600 italic">
                {search.trim() ? "No users match your search." : "No users found."}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Joined</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((u) => {
                  const isUpdating = updatingId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-white/3 transition-colors duration-150">
                      {/* Username */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-violet-300">
                              {(u.username ?? "?")[0].toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-white">{u.username ?? <span className="text-gray-600 italic">—</span>}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4 text-gray-400 hidden md:table-cell">
                        {u.email ?? <span className="text-gray-700 italic">—</span>}
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${roleBadgeClass(u.role)}`}>
                          {u.role ?? "player"}
                        </span>
                      </td>

                      {/* Joined */}
                      <td className="px-6 py-4 text-gray-500 hidden sm:table-cell">
                        {fmtDate(u.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        {u.role === "owner" ? (
                          <span className="text-xs text-gray-700 italic">Protected</span>
                        ) : u.role === "admin" ? (
                          <button
                            onClick={() => handleRoleChange(u.id, "player")}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/25 bg-red-500/8 text-red-400 text-xs font-medium hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          >
                            {isUpdating ? (
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            Remove Admin
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRoleChange(u.id, "admin")}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-500/25 bg-violet-500/8 text-violet-400 text-xs font-medium hover:bg-violet-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                          >
                            {isUpdating ? (
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            Make Admin
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </main>
    </div>
  );
}
