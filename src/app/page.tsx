import UploadForm from "@/components/UploadForm";
import ProductGrid from "@/components/ProductGrid";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-violet-300">Powered by Aholo Lux3D</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">商品 3D 工作台</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          一张商品图，自动生成 3D 模型、三视图、多角度图和 360° 转盘视频。不用建模、不用寄样：个人商家一人出全套商品素材，跨境品牌把 3D 样品直接发给海外达人开箱。
        </p>
      </header>
      <UploadForm />
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">我的商品</h2>
        <ProductGrid />
      </section>
    </main>
  );
}
