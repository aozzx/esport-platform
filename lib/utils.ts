export function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function tournamentStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "open":        return { label: "Open",      color: "bg-green-500/15 border-green-500/30 text-green-400" };
    case "in_progress": return { label: "Live",      color: "bg-blue-500/15 border-blue-500/30 text-blue-400" };
    case "completed":   return { label: "Completed", color: "bg-gray-500/15 border-gray-500/30 text-gray-400" };
    case "cancelled":   return { label: "Cancelled", color: "bg-red-500/15 border-red-500/30 text-red-400" };
    default:            return { label: "Draft",     color: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400" };
  }
}

export function tournamentFormatLabel(format: string): string {
  switch (format) {
    case "single_elimination": return "Single Elimination";
    case "double_elimination": return "Double Elimination";
    case "round_robin":        return "Round Robin";
    default:                   return format;
  }
}
