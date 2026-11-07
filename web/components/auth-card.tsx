export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card card-border bg-base-100 w-full max-w-md">
        <div className="card-body gap-4">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {children}
          <p className="text-sm text-base-content/70">{footer}</p>
        </div>
      </div>
    </main>
  );
}
