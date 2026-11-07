"use client";

import { authClient } from "@/lib/auth/client";
import { useState } from "react";

export function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");
    try {
      const { error: failure } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/account",
      });
      if (failure) {
        setError(failure.message || "Google sign-in failed.");
        setPending(false);
      }
    } catch {
      setError("Google sign-in failed.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="divider my-0">or</div>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <button type="button" className="btn btn-neutral" onClick={() => void signIn()} disabled={pending}>
        {pending ? "Opening Google..." : "Sign in with Google"}
      </button>
    </div>
  );
}
