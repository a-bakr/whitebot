import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white gap-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">WhiteBot</h1>
        <p className="mt-2 text-muted-foreground">AI-powered whiteboard tutor</p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md border border-input px-5 py-2 text-sm font-medium hover:bg-accent"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Get Started
        </Link>
      </div>
    </main>
  );
}
