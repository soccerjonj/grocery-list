"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  inviteCode: string;
  householdName: string;
}

export default function InviteModal({
  open,
  onClose,
  inviteCode,
  householdName,
}: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/household/join?code=${inviteCode}`
      : `/household/join?code=${inviteCode}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite someone">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-gray-500">
          Share this code or link to invite someone to{" "}
          <span className="font-medium text-gray-900">{householdName}</span>.
        </p>

        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">
            Invite code
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-3">
            <span className="font-mono text-3xl tracking-[0.25em] font-semibold text-gray-900 select-all">
              {inviteCode.toUpperCase()}
            </span>
          </div>
        </div>

        <Button
          onClick={handleCopy}
          variant={copied ? "ghost" : "primary"}
          size="lg"
          className="w-full"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy invite link
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}
