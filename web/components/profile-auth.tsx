"use client";

import { authClient } from "@/lib/auth/client";
import { useState } from "react";

export function ProfileAuth() {
  const { data: session, isPending } = authClient.useSession();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    setPending(false);
  }

  if (isPending) return <div className="h-10" aria-hidden="true" />;

  if (session?.user) {
    return (
      <button type="button" className="btn btn-error" onClick={() => void signOut()} disabled={pending}>
        {pending ? "Signing out..." : "Sign out"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn btn-info" href="/auth/sign-up">Create an account</a>
      <a className="btn btn-success" href="/auth/sign-in">Sign in</a>
    </div>
  );
}
