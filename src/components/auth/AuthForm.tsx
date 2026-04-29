"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ColorPicker from "@/components/ui/ColorPicker";
import { getErrorMessage } from "@/lib/utils";
import { Suspense } from "react";

type Mode = "login" | "signup";

function AuthFormInner({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [error, setError] = useState(
    searchParams.get("error") === "confirmation_failed"
      ? "That confirmation link has expired or is invalid. Please request a new one by signing up again."
      : ""
  );
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!selectedColor) throw new Error("Please choose a color for your profile.");
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              display_name: fullName,
              color: selectedColor,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpError) throw signUpError;
        // Supabase returns a session immediately if email confirmation is disabled,
        // or identities[] is empty if the user already exists.
        if (data.session && data.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            display_name: fullName,
            color: selectedColor,
          });
          router.push("/dashboard");
          router.refresh();
        } else {
          // Email confirmation required — color is in user_metadata, applied on confirm
          setConfirming(true);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: isDark ? "linear-gradient(160deg, #09090b 0%, #18181b 60%, #27272a 100%)" : "linear-gradient(160deg, #f8fafc 0%, #f1f5f9 60%, #e2e8f0 100%)" }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-sm text-center"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 dark:bg-zinc-100 rounded-2xl mb-6">
            <svg
              className="w-7 h-7 text-white dark:text-zinc-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-2">
            Check your email
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            We sent a confirmation link to
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50 mb-6">{email}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Click the link in the email to activate your account, then come back
            and sign in.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center w-full bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-xl px-5 py-3 hover:bg-gray-700 dark:hover:bg-zinc-200 active:scale-[0.97] active:bg-gray-800 transition-all"
          >
            Go to sign in
          </Link>
          <button
            onClick={() => setConfirming(false)}
            className="block w-full text-center text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mt-4 transition-colors active:opacity-60"
          >
            Use a different email
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: isDark ? "linear-gradient(160deg, #09090b 0%, #18181b 60%, #27272a 100%)" : "linear-gradient(160deg, #f8fafc 0%, #f1f5f9 60%, #e2e8f0 100%)" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 dark:bg-zinc-100 rounded-2xl mb-4 shadow-lg shadow-gray-900/20">
            <svg
              className="w-7 h-7 text-white dark:text-zinc-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {mode === "login"
              ? "Sign in to your household"
              : "Start tracking together"}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md shadow-gray-200/60 dark:shadow-none border border-gray-100/80 dark:border-zinc-800 p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="first-name"
                    label="First name"
                    type="text"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                  <Input
                    id="last-name"
                    label="Last name"
                    type="text"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Your color
                    <span className="text-red-400 ml-0.5">*</span>
                  </p>
                  <p className="text-xs text-gray-400 -mt-1">Shown to your household so they know it&apos;s you</p>
                  <ColorPicker value={selectedColor} onChange={setSelectedColor} />
                </div>
              </>
            )}
            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              id="password"
              label="Password"
              type="password"
              placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              loading={loading}
              disabled={mode === "signup" && !selectedColor}
              className="w-full mt-1"
            >
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
          {mode === "login" ? (
            <>
              No account?{" "}
              <Link href="/auth/signup" className="font-medium text-gray-900 dark:text-gray-50 hover:underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/auth/login" className="font-medium text-gray-900 dark:text-gray-50 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  return (
    <Suspense>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}
