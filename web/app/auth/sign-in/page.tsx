"use client";

import { AuthCard } from "@/components/auth-card";
import { GoogleSignIn } from "@/components/google-sign-in";
import { useActionState } from "react";
import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signInWithEmail, null);

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New here? <a className="link" href="/auth/sign-up">Create an account</a>
        </>
      }
    >
      <form className="flex flex-col gap-4" action={formAction}>
        <label className="floating-label">
          <input className="input w-full" name="email" type="email" required placeholder="Email" autoComplete="email" />
          <span>Email</span>
        </label>
        <label className="floating-label">
          <input className="input w-full" name="password" type="password" required placeholder="Password" autoComplete="current-password" />
          <span>Password</span>
        </label>
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button className="btn btn-neutral" type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <GoogleSignIn />
    </AuthCard>
  );
}
