import { useEffect, useRef } from "react";
import * as THREE from "three";

const DEFAULT_CLASS = "size-64 md:size-80";

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uZoom;
  uniform float uDistortion;
  uniform float uRgbSplit;
  uniform float uSpeed;
  uniform float uRepeats;
  uniform float uGrain;
  uniform float uFresnel;
  uniform float uSpec;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  varying vec2 vUv;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec3 colorMap(float t) {
    t = fract(t);
    if (t < 0.25) return mix(uColor0, uColor1, t / 0.25);
    if (t < 0.50) return mix(uColor1, uColor2, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(uColor2, uColor3, (t - 0.50) / 0.25);
    return mix(uColor3, uColor4, (t - 0.75) / 0.25);
  }

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;
    float r = length(uv);

    if (r > 1.0) {
      gl_FragColor = vec4(0.03, 0.04, 0.07, 1.0);
      return;
    }

    float t = uTime * uSpeed;

    float k = uDistortion;
    vec2 p = uv * (1.0 + k * r * r) * uZoom;

    vec2 dir = uv / (r + 0.001);
    float split = uRgbSplit * uZoom;

    vec3 qR = vec3(p + dir * split, t);
    vec3 qG = vec3(p, t);
    vec3 qB = vec3(p - dir * split, t);

    float nR = snoise(qR) + 0.5 * snoise(qR * 2.0 + t * 0.5);
    float nG = snoise(qG) + 0.5 * snoise(qG * 2.0 + t * 0.5);
    float nB = snoise(qB) + 0.5 * snoise(qB * 2.0 + t * 0.5);

    nR = nR * 0.5 + 0.5;
    nG = nG * 0.5 + 0.5;
    nB = nB * 0.5 + 0.5;

    float gR = fract(nR * uRepeats + t * 0.5);
    float gG = fract(nG * uRepeats + t * 0.5);
    float gB = fract(nB * uRepeats + t * 0.5);

    vec3 col = vec3(colorMap(gR).r, colorMap(gG).g, colorMap(gB).b);

    float fresnel = pow(1.0 - r, 2.0) * uFresnel;
    col += vec3(0.30, 0.45, 0.80) * fresnel;

    float spec = pow(max(0.0, 1.0 - length(uv - vec2(-0.5, -0.5)) * 1.6), 3.0);
    col += vec3(0.95, 0.98, 1.00) * spec * uSpec;

    col *= 1.0 - 0.1 * r;

    float grain = hash(uv * 500.0 + uTime * 2.0);
    col += (grain - 0.5) * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Shader time the sphere starts at (before any playback advances it). uTime=0
// looks flat/uninteresting; bump this to land on a nicer-looking first frame.
// Tweak and reload to preview — while paused/idle, uTime stays frozen here.
const INITIAL_TIME = 150;

const PARAMS = {
  zoom: 0.541,
  distortion: -1.196,
  rgbSplit: 0.0156,
  speed: 0.02,
  repeats: 1.55,
  grain: 0,
  fresnel: 0.476,
  spec: 0,
  color0: "#2f3d61",
  color1: "#2e4377",
  color2: "#4f57ba",
  color3: "#818cf8",
  color4: "#2b4377",
};

type VoiceSphereProps = {
  className?: string;
  isPlaying?: boolean;
  loading?: boolean;
};
export function VoiceSphere({
  className = DEFAULT_CLASS,
  isPlaying = false,
  loading = false,
}: VoiceSphereProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 0.5;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uZoom: { value: PARAMS.zoom },
        uDistortion: { value: PARAMS.distortion },
        uRgbSplit: { value: PARAMS.rgbSplit },
        uSpeed: { value: PARAMS.speed },
        uRepeats: { value: PARAMS.repeats },
        uGrain: { value: PARAMS.grain },
        uFresnel: { value: PARAMS.fresnel },
        uSpec: { value: PARAMS.spec },
        uColor0: { value: new THREE.Color(PARAMS.color0) },
        uColor1: { value: new THREE.Color(PARAMS.color1) },
        uColor2: { value: new THREE.Color(PARAMS.color2) },
        uColor3: { value: new THREE.Color(PARAMS.color3) },
        uColor4: { value: new THREE.Color(PARAMS.color4) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    scene.add(new THREE.Mesh(geometry, material));

    let rafId = 0;
    let uTime = INITIAL_TIME;
    let lastFrame = 0;

    function resize() {
      if (!wrapper) return;
      const { clientWidth, clientHeight } = wrapper;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight, false);
      material.uniforms.uResolution.value.set(clientWidth, clientHeight);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);

    function animate() {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      if (lastFrame) {
        const dt = (now - lastFrame) / 1000;
        if (isPlayingRef.current) {
          uTime += dt;
        }
      }
      lastFrame = now;
      material.uniforms.uTime.value = uTime;
      renderer.render(scene, camera);
    }

    resize();
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div aria-hidden="true" className={`relative ${className}`} ref={wrapperRef}>
      <div className="absolute inset-0 bg-bg-voicesphere blur-[32px] scale-120 rounded-full opacity-50" />
      {loading && <div className="absolute -inset-1.5 rounded-full voicesphere-loading-ring" />}

      <div className="relative overflow-hidden rounded-full size-full">
        <canvas className="block size-full" ref={canvasRef} />
      </div>
    </div>
  );
}
