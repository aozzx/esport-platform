"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

type Report = {
  id: string;
  type: "complaint" | "suggestion";
  title: string;
  description: string;
  evidence_url: string | null;
  status: "pending" | "under_review" | "resolved";
  created_at: string;
  profiles: { username: string } | null;
};

type TypeFilter = "all" | "complaint" | "suggestion";
type StatusFilter = "all" | "pending" | "under_review" | "resolved";

const STATUS_SEQUENCE = ["pending", "under_review", "resolved"] as const;

export default function AdminReportsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [username, setUsername] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingToStatus, setUpdatingToStatus] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "owner" && profile?.role !== "admin") {
        router.push("/");
        return;
      }

      const { data } = await supabase
        .from("reports")
        .select("id, type, title, description, evidence_url, status, created_at, profiles(username)")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      setUsername(profile.username);
      setReports((data ?? []) as unknown as Report[]);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [supabase, router]);

  async function handleStatusChange(reportId: string, newStatus: string) {
    setUpdatingId(reportId);
    setUpdatingToStatus(newStatus);

    const { data: { user: actor } } = await supabase.auth.getUser();
    if (!actor) { router.push("/sign-in"); setUpdatingId(null); setUpdatingToStatus(null); return; }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", actor.id)
      .maybeSingle();

    if (callerProfile?.role !== "owner" && callerProfile?.role !== "admin") {
      showError("You no longer have permission to update reports.");
      setUpdatingId(null);
      setUpdatingToStatus(null);
      return;
    }

    const { error } = await supabase
      .from("reports")
      .update({ status: newStatus })
      .eq("id", reportId);

    if (error) {
      console.error("[reports] update error:", error.code, error.message, error.details, error.hint);
      showError("Failed to update report status. Please try again.");
    } else {
      setReports((prev) =>
        prev.map((r) => r.id === reportId ? { ...r, status: newStatus as Report["status"] } : r)
      );
      showSuccess("Status updated.");
    }

    setUpdatingId(null);
    setUpdatingToStatus(null);
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 2500);
  }

  function showError(msg: string) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000);
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function typeBadge(type: Report["type"]) {
    return type === "complaint"
      ? "bg-red-500/15 border-red-500/30 text-red-400"
      : "bg-blue-500/15 border-blue-500/30 text-blue-400";
  }

  function statusBadge(status: Report["status"]) {
    switch (status) {
      case "pending":      return "bg-yellow-500/15 border-yellow-500/30 text-yellow-400";
      case "under_review": return "bg-violet-500/15 border-violet-500/30 text-violet-400";
      case "resolved":     return "bg-green-500/15 border-green-500/30 text-green-400";
    }
  }

  function statusLabel(status: string) {
    switch (status) {
      case "pending":      return "Pending";
      case "under_review": return "Under Review";
      case "resolved":     return "Resolved";
      default:             return status;
    }
  }

  const filtered = reports.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-500">Loading reports...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Navbar username={username} />

      <main className="max-w-5xl mx-auto px-6 pt-28 pb-20 space-y-5">

        {/* Header */}
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 overflow-hidden">
          <div className="absolute -top-16 -left-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium mb-3">
              Admin Panel
            </div>
            <h1 className="text-2xl font-extrabold text-white">Reports</h1>
            <p className="text-sm text-gray-500 mt-1">{reports.length} total · {filtered.length} shown</p>
          </div>
        </div>

        {successMsg && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {errorMsg}
          </div>
        )}

        {/* Filters */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center gap-4">

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Type</span>
              <div className="flex items-center gap-1">
                {(["all", "complaint", "suggestion"] as TypeFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 capitalize ${
                      typeFilter === f
                        ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                        : "border-white/10 bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    {f === "all" ? "All" : f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Status</span>
              <div className="flex items-center gap-1">
                {(["all", "pending", "under_review", "resolved"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
                      statusFilter === f
                        ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                        : "border-white/10 bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    {f === "all" ? "All" : statusLabel(f)}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Reports list */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-600 italic text-center py-6">No reports match the current filters</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((report) => {
                const isExpanded = expandedId === report.id;
                return (
                  <div
                    key={report.id}
                    className="rounded-xl border border-white/8 bg-white/3 overflow-hidden"
                  >
                    {/* Row */}
                    <div className="flex items-start gap-3 px-4 py-3">

                      {/* Type + status badges */}
                      <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${typeBadge(report.type)}`}>
                          {report.type}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge(report.status)}`}>
                          {statusLabel(report.status)}
                        </span>
                      </div>

                      {/* Title + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{report.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {report.profiles?.username ?? "Unknown"} · {fmtDate(report.created_at)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Status progression buttons */}
                        <div className="flex items-center gap-1">
                          {STATUS_SEQUENCE.map((s) => (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(report.id, s)}
                              disabled={report.status === s || updatingId === report.id}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all duration-200 disabled:cursor-not-allowed ${
                                report.status === s
                                  ? statusBadge(s) + " opacity-100"
                                  : "border-white/10 bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10 disabled:opacity-40"
                              }`}
                            >
                              {updatingId === report.id && updatingToStatus === s ? (
                                <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : statusLabel(s)}
                            </button>
                          ))}
                        </div>

                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : report.id)}
                          className="flex items-center justify-center w-7 h-7 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-all duration-200"
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-3">
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                          {report.description}
                        </p>
                        {report.evidence_url && (() => { try { return new URL(report.evidence_url!).protocol === "https:"; } catch { return false; } })() && (
                          <a
                            href={report.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors duration-200"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                            View Evidence
                          </a>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
