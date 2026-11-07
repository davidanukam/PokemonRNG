"use client";

import { AuthCard } from "@/components/auth-card";
import { useActionState } from "react";
import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUpWithEmail, null);

  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have an account? <a className="link" href="/auth/sign-in">Sign in</a>
        </>
      }
    >
      <form className="flex flex-col gap-4" action={formAction}>
        <label className="floating-label">
          <input className="input w-full" name="name" type="text" required maxLength={80} placeholder="Name" autoComplete="name" />
          <span>Name</span>
        </label>
        <label className="floating-label">
          <input className="input w-full" name="email" type="email" required placeholder="Email" autoComplete="email" />
          <span>Email</span>
        </label>
        <label className="floating-label">
          <input className="input w-full" name="password" type="password" required minLength={8} placeholder="Password" autoComplete="new-password" />
          <span>Password</span>
        </label>
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button className="btn btn-neutral" type="submit" disabled={pending}>
          {pending ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
