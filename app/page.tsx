import { AppBar } from "@/components/app-bar";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppBar />
      <main className="flex-1 p-8">
        <div className="container mx-auto max-w-2xl">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">Starting App</h1>
            <p className="text-muted-foreground text-lg">
              Built with Next.js and shadcn/ui
            </p>
          </header>

        </div>
      </main>
      <Footer />
    </div>
  );
}
