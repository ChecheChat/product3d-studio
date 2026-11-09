"use client";
import React, { Suspense, forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Center, Bounds, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

export type ViewImage = { name: string; dataUrl: string };

export type ViewerHandle = {
  /** 录制一圈转盘视频，返回 mp4/webm Blob */
  recordTurntable: (seconds?: number) => Promise<Blob>;
  /** 用正交相机渲染三视图 + 多角度图（透明背景 PNG） */
  captureViews: () => Promise<ViewImage[]>;
  snapshot: () => string | null;
};

const VIEWS: { name: string; dir: [number, number, number]; up: [number, number, number] }[] = [
  { name: "正视图", dir: [0, 0, 1], up: [0, 1, 0] },
  { name: "右视图", dir: [1, 0, 0], up: [0, 1, 0] },
  { name: "俯视图", dir: [0, 1, 0], up: [0, 0, -1] },
  { name: "后视图", dir: [0, 0, -1], up: [0, 1, 0] },
  { name: "左视图", dir: [-1, 0, 0], up: [0, 1, 0] },
  { name: "3/4 视图", dir: [1, 0.7, 1], up: [0, 1, 0] },
];

type SceneApi = {
  canvas: HTMLCanvasElement;
  capture: () => ViewImage[];
};

const TARGET_SIZE = 1.6;

function Model({
  url,
  spin,
  yaw,
  onLoaded,
  groupRef,
}: {
  url: string;
  spin: boolean;
  yaw: number;
  onLoaded?: () => void;
  groupRef: React.MutableRefObject<THREE.Group | null>;
}) {
  const { scene } = useGLTF(url);
  // Lux3D 会按真实尺寸缩放（鼠标约 0.12m、椅子约 0.9m），这里统一缩放到同一个观看尺寸
  const scale = React.useMemo(() => {
    const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z);
    return max > 0 ? TARGET_SIZE / max : 1;
  }, [scene]);
  useEffect(() => {
    onLoaded?.();
  }, [scene, onLoaded]);
  useFrame((_, dt) => {
    if (spin && groupRef.current) groupRef.current.rotation.y += dt * 0.6;
  });
  return (
    <group ref={groupRef}>
      <group rotation-y={(yaw * Math.PI) / 180} scale={scale}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

/** 挂在 Canvas 内部，拿到 gl / scene 并暴露正交视图抓取 */
function SceneBridge({
  api,
  modelRef,
  shadowRef,
}: {
  api: React.MutableRefObject<SceneApi | null>;
  modelRef: React.MutableRefObject<THREE.Group | null>;
  shadowRef: React.MutableRefObject<THREE.Group | null>;
}) {
  const { gl, scene, size } = useThree();
  api.current = {
    canvas: gl.domElement,
    capture: () => {
      const target = modelRef.current;
      if (!target) return [];
      const prevRot = target.rotation.y;
      target.rotation.y = 0;
      target.updateMatrixWorld(true);
      if (shadowRef.current) shadowRef.current.visible = false;

      const box = new THREE.Box3().setFromObject(target);
      const center = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(sz.x, sz.y, sz.z) * 1.15;
      const aspect = size.width / size.height;
      const cam = new THREE.OrthographicCamera(
        (-maxDim / 2) * aspect,
        (maxDim / 2) * aspect,
        maxDim / 2,
        -maxDim / 2,
        0.01,
        maxDim * 20,
      );
      const out: ViewImage[] = [];
      const prevClear = gl.getClearAlpha();
      gl.setClearAlpha(0);
      for (const v of VIEWS) {
        const dir = new THREE.Vector3(...v.dir).normalize();
        cam.position.copy(center).addScaledVector(dir, maxDim * 4);
        cam.up.set(...v.up);
        cam.lookAt(center);
        cam.updateProjectionMatrix();
        gl.render(scene, cam);
        out.push({ name: v.name, dataUrl: gl.domElement.toDataURL("image/png") });
      }
      gl.setClearAlpha(prevClear);
      if (shadowRef.current) shadowRef.current.visible = true;
      target.rotation.y = prevRot;
      return out;
    },
  };
  return null;
}

type ViewerProps = {
  url: string;
  autoRotate?: boolean;
  className?: string;
  /** 朝向校正：绕竖直轴旋转的角度（0/90/180/270），决定哪一面算「正视图」 */
  yaw?: number;
  onReady?: () => void;
};

const ModelViewer = forwardRef<ViewerHandle, ViewerProps>(
  function ModelViewer({ url, autoRotate = true, className, yaw = 0, onReady }, ref) {
    const sceneApi = useRef<SceneApi | null>(null);
    const modelRef = useRef<THREE.Group | null>(null);
    const shadowRef = useRef<THREE.Group | null>(null);
    const [recording, setRecording] = useState(false);
    const [spin, setSpin] = useState(autoRotate);
    const [loaded, setLoaded] = useState(false);
    const onLoaded = useCallback(() => {
      setLoaded(true);
      onReady?.();
    }, [onReady]);

    const recordTurntable = useCallback(async (seconds = 6) => {
      const canvas = sceneApi.current?.canvas;
      if (!canvas) throw new Error("画布未就绪");
      const stream = canvas.captureStream(30);
      const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"].find(
        (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
      );
      if (!mime) throw new Error("浏览器不支持录制");
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: mime }))));
      setRecording(true);
      rec.start(200);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      rec.stop();
      setRecording(false);
      return done;
    }, []);

    const captureViews = useCallback(async () => {
      if (!sceneApi.current) throw new Error("画布未就绪");
      return sceneApi.current.capture();
    }, []);

    useImperativeHandle(ref, () => ({
      recordTurntable,
      captureViews,
      snapshot: () => sceneApi.current?.canvas.toDataURL("image/png") ?? null,
    }));

    return (
      <div className={`relative ${className ?? ""}`}>
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [2.2, 1.4, 2.6], fov: 40 }}
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
          className="rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-950"
        >
          <SceneBridge api={sceneApi} modelRef={modelRef} shadowRef={shadowRef} />
          {/* 本地「虚拟摄影棚」反射环境：不加载任何外网 HDR，国内和海外都能秒开 */}
          <Environment resolution={256} frames={1}>
            <Lightformer form="rect" intensity={3} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
            <Lightformer form="rect" intensity={2.2} position={[0, 1.5, 6]} scale={[12, 4, 1]} />
            <Lightformer form="rect" intensity={1.6} position={[-6, 1.5, 0]} rotation-y={Math.PI / 2} scale={[12, 3, 1]} />
            <Lightformer form="rect" intensity={1.6} position={[6, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[12, 3, 1]} />
            <Lightformer form="rect" intensity={1} position={[0, 1.5, -6]} rotation-y={Math.PI} scale={[12, 3, 1]} />
          </Environment>
          <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#3b3b45" />
          <directionalLight position={[4, 6, 4]} intensity={1.6} castShadow />
          <directionalLight position={[-4, 3, -3]} intensity={0.6} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.25}>
              <Center bottom>
                <Model url={url} spin={spin && !recording} yaw={yaw} onLoaded={onLoaded} groupRef={modelRef} />
              </Center>
            </Bounds>
            <group ref={shadowRef}>
              <ContactShadows position={[0, -0.01, 0]} opacity={0.5} scale={6} blur={2.2} far={3} />
            </group>
          </Suspense>
          <OrbitControls makeDefault enablePan={false} autoRotate={recording} autoRotateSpeed={10} minDistance={0.8} maxDistance={8} />
        </Canvas>
        {!loaded && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">模型加载中…</span>
          </div>
        )}
        {recording && (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
            ● 录制中
          </span>
        )}
        <button
          type="button"
          onClick={() => setSpin((s) => !s)}
          className="absolute bottom-3 right-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur hover:bg-black/70"
        >
          {spin ? "停止旋转" : "自动旋转"}
        </button>
      </div>
    );
  },
);

export default ModelViewer;

/** 把多张视图拼成一张带标签的合成图 */
export async function composeSheet(views: ViewImage[], title: string): Promise<string> {
  const imgs = await Promise.all(
    views.map(
      (v) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = v.dataUrl;
        }),
    ),
  );
  const cols = 3;
  const rows = Math.ceil(views.length / cols);
  const cell = 640;
  const pad = 24;
  const label = 44;
  const W = cols * cell + (cols + 1) * pad;
  const H = 80 + rows * (cell + label) + (rows + 1) * pad;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#111";
  ctx.font = "600 30px system-ui, -apple-system, 'PingFang SC', sans-serif";
  ctx.fillText(`${title} · 三视图 / 多角度图`, pad, 52);
  ctx.font = "400 18px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#777";
  ctx.fillText("Generated by Aholo Lux3D", W - pad - 230, 52);
  imgs.forEach((im, i) => {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x = pad + col * (cell + pad);
    const y = 80 + pad + r * (cell + label + pad);
    ctx.fillStyle = "#f4f4f5";
    ctx.fillRect(x, y, cell, cell);
    const s = Math.min(cell / im.width, cell / im.height);
    const w = im.width * s;
    const h = im.height * s;
    ctx.drawImage(im, x + (cell - w) / 2, y + (cell - h) / 2, w, h);
    ctx.fillStyle = "#111";
    ctx.font = "500 22px system-ui, -apple-system, 'PingFang SC', sans-serif";
    ctx.fillText(views[i].name, x, y + cell + 30);
  });
  return c.toDataURL("image/png");
}
