type Badge = { type: string; place: number };

const seasonCfg: Record<number, { bg: string; fg: string; label: string }> = {
  1: { bg: "bg-yellow-400", fg: "text-yellow-900", label: "Season 1st" },
  2: { bg: "bg-gray-400",   fg: "text-gray-900",   label: "Season 2nd" },
  3: { bg: "bg-orange-500", fg: "text-white",       label: "Season 3rd" },
  4: { bg: "bg-gray-600",   fg: "text-white",       label: "Season 4th" },
};

export default function BadgeList({
  badges,
}: {
  badges: object[] | null | undefined;
}) {
  const list = (badges ?? []) as Badge[];
  if (list.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {list.map((badge, i) => {
        if (badge.type === "tournament") {
          if (badge.place === 1)
            return (
              <span key={i} title="Tournament Champion" className="text-sm leading-none">
                🏆
              </span>
            );
          if (badge.place === 2)
            return (
              <span key={i} title="Tournament Runner-up" className="text-sm leading-none">
                🥈
              </span>
            );
        }

        if (badge.type === "season") {
          const c = seasonCfg[badge.place];
          if (!c) return null;
          return (
            <span
              key={i}
              title={c.label}
              className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${c.bg} ${c.fg} text-[10px] font-bold shrink-0 leading-none`}
            >
              {badge.place}
            </span>
          );
        }

        return null;
      })}
    </div>
  );
}
