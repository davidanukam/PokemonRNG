import { signOut } from "@/app/auth/sign-out/actions";
import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card card-border bg-base-100 w-full max-w-md">
        <div className="card-body gap-4">
          <h1 className="text-2xl font-semibold">Signed in</h1>
          <p>
            <span className="text-base-content/70">Name</span>
            <br />
            <span data-testid="account-name">{user.name}</span>
          </p>
          <p>
            <span className="text-base-content/70">Email</span>
            <br />
            <span data-testid="account-email">{user.email}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-neutral" href="/">Back to packs</a>
            <form action={signOut}>
              <button className="btn" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
