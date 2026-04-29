"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import ColorPicker from "@/components/ui/ColorPicker";
import { getErrorMessage } from "@/lib/utils";
import { Suspense } from "react";

type Step = "code" | "color";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [household, setHousehold] = useState<{ id: string; name: string } | null>(null);
  const [takenColors, setTakenColors] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Look up household by invite code
      const { data: hh, error: lookupError } = await supabase
        .from("households")
        .select("id, name")
        .eq("invite_code", code.trim().toLowerCase())
        .single();

      if (lookupError || !hh) throw new Error("Invalid invite code. Please check and try again.");

      // Already a member — just navigate
      const { data: existing } = await supabase
        .from("household_members")
        .select("id")
        .eq("household_id", hh.id)
        .eq("user_id", user.id)
        .single();

      if (existing) {
        router.push(`/household/${hh.id}/pantry`);
        return;
      }

      // Fetch colors already taken by existing members
      const { data: memberRows } = await supabase
        .from("household_members")
        .select("user_id")
        .eq("household_id", hh.id);

      const memberIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);
      let taken: string[] = [];
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("color")
          .in("id", memberIds);
        taken = (profiles ?? [])
          .map((p: { color: string | null }) => p.color)
          .filter((c): c is string => !!c);
      }
      setTakenColors(taken);

      // Pre-select user's current color if not taken
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("color")
        .eq("id", user.id)
        .single();
      const myColor = myProfile?.color ?? null;
      setSelectedColor(myColor && !taken.includes(myColor) ? myColor : null);

      setHousehold(hh);
      setStep("color");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!household || !selectedColor) return;
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fullName =
        user.user_metadata?.display_name ||
        [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ") ||
        user.email?.split("@")[0] ||
        "";

      // Save chosen color to profile
      await supabase.from("profiles").upsert(
        { id: user.id, display_name: fullName, color: selectedColor },
        { onConflict: "id" }
      );

      // Join the household
      const { error: joinError } = await supabase
        .from("household_members")
        .insert({ household_id: household.id, user_id: user.id, role: "member" });
      if (joinError) throw joinError;

      router.push(`/household/${household.id}/pantry`);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-zinc-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm"
      >
        <div className="mb-6">
          <button
            type="button"
            onClick={() => step === "color" ? setStep("code") : router.push("/dashboard")}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors active:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <AnimatePresence mode="wait">
          {step === "code" ? (
            <motion.div
              key="code"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-7">
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Join a household</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter the invite code shared with you</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6">
                <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="code" className="text-sm font-medium text-gray-700 dark:text-gray-300">Invite code</label>
                    <input
                      id="code"
                      type="text"
                      placeholder="e.g. a1b2c3d4"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-gray-900 dark:focus:ring-zinc-400 focus:border-transparent outline-none font-mono tracking-widest text-center text-lg uppercase"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                  )}

                  <Button type="submit" size="lg" loading={loading} className="w-full mt-1">
                    Continue
                  </Button>
                </form>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="color"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-7">
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Pick your color</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Joining <span className="font-medium text-gray-900 dark:text-gray-50">{household?.name}</span> — choose a color that&apos;s yours
                </p>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6 flex flex-col gap-5">
                <ColorPicker
                  value={selectedColor}
                  onChange={setSelectedColor}
                  takenColors={takenColors}
                />

                {takenColors.length > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                    Locked colors are already taken by someone in this household
                  </p>
                )}

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <Button
                  type="button"
                  size="lg"
                  loading={loading}
                  disabled={!selectedColor}
                  className="w-full"
                  onClick={handleJoin}
                >
                  Join household
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
