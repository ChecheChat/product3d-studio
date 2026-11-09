import Link from "next/link";
import RoomView from "@/components/RoomView";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <nav className="mb-6 text-sm text-zinc-400">
        <Link href="/" className="hover:text-zinc-200">← 我的商品</Link>
      </nav>
      <RoomView id={id} mode="brand" />
    </main>
  );
}
