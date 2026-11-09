import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

/**
 * 把 Lux3D 原始 GLB（两张 2048 PNG 贴图，约 9–12MB）压成网页展示版：
 * 贴图转 WebP 并缩到 1024，几何用 meshopt 压缩（three.js 自带解码器，不依赖外网 CDN）。
 * 实测 9.2MB → 0.7MB，耗时 < 1 秒。
 */
export async function optimizeGlb(input: Uint8Array): Promise<Uint8Array> {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
  const doc = await io.readBinary(input);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  return io.writeBinary(doc);
}
