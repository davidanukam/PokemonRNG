"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signUpWithEmail(_prevState: { error: string } | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !name || password.length < 8) {
    return { error: "Enter a name, an email, and a password of at least 8 characters." };
  }

  const { error } = await auth.signUp.email({ email, name, password });
  if (error) return { error: error.message || "Could not create the account." };
  redirect("/account");
}
