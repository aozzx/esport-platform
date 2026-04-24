"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SeasonDetailPage() {
  const router = useRouter();
  const params = useParams();
  const seasonId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/sign-in"); return; }
      router.replace("/seasons");
    }
    check();
  }, [supabase, router, seasonId]);

  return null;
}
