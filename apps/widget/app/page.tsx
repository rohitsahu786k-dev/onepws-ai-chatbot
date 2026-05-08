import { ChatWidget } from "../components/chat-widget";

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_420px]">
        <section aria-label="Preview canvas" />
        <ChatWidget embedded={false} />
      </div>
    </main>
  );
}
