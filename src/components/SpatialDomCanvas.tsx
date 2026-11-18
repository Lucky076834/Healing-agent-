import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export type EnginePhase = 'idle' | 'running' | 'broken' | 'healing' | 'healed';

export interface SpatialSceneState {
  domVersion: 'v1' | 'v2';
  enginePhase: EnginePhase;
  activeStepId: string | null;
}

export interface TelemetrySnapshot {
  camX: number;
  camY: number;
  camZ: number;
  stageLabel: string;
  explodeFactor: number;
  nodeCount: number;
}

interface SpatialDomCanvasProps {
  sceneState: SpatialSceneState;
  onTelemetry?: (snapshot: TelemetrySnapshot) => void;
}

interface DomNodeSpec {
  id: string;
  label: string;
  layer: 0 | 1 | 2; // 0: Legacy root/form, 1: Mutated wrappers, 2: Semantic leaves
  basePos: [number, number, number];
  parentIdx: number | null;
  stepId?: string;
  scale: number;
}

const NODE_SPECS: DomNodeSpec[] = [
  // Layer 0: Root & Legacy Selector Plane
  { id: 'window', label: 'window', layer: 0, basePos: [0, 2.7, 0], parentIdx: null, scale: 0.42 },
  { id: 'document', label: 'document', layer: 0, basePos: [0, 1.85, 0], parentIdx: 0, scale: 0.34 },
  { id: 'body', label: 'body', layer: 0, basePos: [0, 1.1, 0], parentIdx: 1, scale: 0.32 },
  { id: 'header', label: 'header.nav', layer: 0, basePos: [-2.3, 1.05, -0.6], parentIdx: 2, scale: 0.22 },
  { id: 'form', label: 'form#erp', layer: 0, basePos: [0.3, 0.35, 0.1], parentIdx: 2, scale: 0.32 },

  // Layer 1: Wrapper / Mutated Chaos Plane
  { id: 'wrap-1', label: 'div.erp-v2-field-group[0]', layer: 1, basePos: [-2.1, -0.55, 0.4], parentIdx: 4, scale: 0.25 },
  { id: 'wrap-2', label: 'div.erp-v2-field-group[1]', layer: 1, basePos: [-0.65, -0.55, -0.35], parentIdx: 4, scale: 0.25 },
  { id: 'wrap-3', label: 'div.erp-v2-field-group[2]', layer: 1, basePos: [0.85, -0.55, 0.45], parentIdx: 4, scale: 0.25 },
  { id: 'wrap-4', label: 'div.erp-v2-actions', layer: 1, basePos: [2.3, -0.55, -0.25], parentIdx: 4, scale: 0.27 },
  { id: 'frame-1', label: 'div.inner-frame[0]', layer: 1, basePos: [-2.1, -1.2, 0.7], parentIdx: 5, scale: 0.18 },
  { id: 'frame-2', label: 'div.inner-frame[1]', layer: 1, basePos: [-0.65, -1.2, -0.6], parentIdx: 6, scale: 0.18 },
  { id: 'frame-3', label: 'div.inner-frame[2]', layer: 1, basePos: [0.85, -1.2, 0.7], parentIdx: 7, scale: 0.18 },

  // Layer 2: Interactive Leaf Controls / Semantic Healer Plane
  { id: 'leaf-vendor', label: 'input[supplier_entity_code]', layer: 2, basePos: [-2.1, -2.0, 0.45], parentIdx: 9, stepId: 'step-vendor', scale: 0.32 },
  { id: 'leaf-amount', label: 'input[po_valuation_usd]', layer: 2, basePos: [-0.65, -2.0, -0.35], parentIdx: 10, stepId: 'step-amount', scale: 0.32 },
  { id: 'leaf-priority', label: 'select[dispatch_sla_tier]', layer: 2, basePos: [0.85, -2.0, 0.45], parentIdx: 11, stepId: 'step-priority', scale: 0.32 },
  { id: 'leaf-submit', label: 'button[commit-ledger-entry]', layer: 2, basePos: [2.3, -2.0, -0.2], parentIdx: 8, stepId: 'step-submit', scale: 0.38 },

  // Auxiliary structural CAD lattice satellites
  { id: 'aux-telemetry', label: 'aside.telemetry', layer: 0, basePos: [2.5, 1.15, -0.7], parentIdx: 2, scale: 0.2 },
  { id: 'aux-ledger', label: 'div.ledger-out', layer: 2, basePos: [2.9, -1.5, 0.85], parentIdx: 15, scale: 0.2 },
  { id: 'aux-guard', label: 'div.csrf-token', layer: 1, basePos: [-2.9, -0.1, -0.9], parentIdx: 4, scale: 0.18 },
  { id: 'aux-audit', label: 'span.audit-hash', layer: 2, basePos: [-2.9, -1.55, -0.8], parentIdx: 18, scale: 0.18 },
];

// Reusable scratch objects (zero GC inside animation loop)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _mat4 = new THREE.Matrix4();
const _scaleVec = new THREE.Vector3();
const _cTarget = new THREE.Color();

export const SpatialDomCanvas: React.FC<SpatialDomCanvasProps> = ({
  sceneState,
  onTelemetry,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<SpatialSceneState>(sceneState);
  const telemetryCbRef = useRef(onTelemetry);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    stateRef.current = sceneState;
  }, [sceneState]);

  useEffect(() => {
    telemetryCbRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.setClearColor(0x09090b, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const handleContextRestored = () => {
      setWebglUnavailable(false);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b);
    scene.fog = new THREE.FogExp2(0x09090b, 0.036);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      46,
      window.innerWidth / window.innerHeight,
      0.1,
      120,
    );
    camera.position.set(4.2, 2.1, 8.2);
    camera.lookAt(-2.6, 0.0, 0);

    // 3-point warm/cool industrial lighting
    const hemi = new THREE.HemisphereLight(0xd4d4d8, 0x18181b, 0.9);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
    keyLight.position.set(6, 10, 7);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x10b981, 0.85);
    rimLight.position.set(-8, -3, -6);
    scene.add(rimLight);

    // Subtle CAD ground grid reference
    const gridHelper = new THREE.GridHelper(28, 28, 0x222226, 0x151518);
    gridHelper.position.y = -3.4;
    scene.add(gridHelper);

    // Three plane reference frames (visible when exploded in Section 02)
    const planeFrames: THREE.LineSegments[] = [];
    const planeColors = [0x3f3f46, 0xff4500, 0x10b981];
    const planeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(7.2, 0.04, 4.4));
    for (let p = 0; p < 3; p += 1) {
      const mat = new THREE.LineBasicMaterial({
        color: planeColors[p],
        transparent: true,
        opacity: 0.14,
      });
      const frame = new THREE.LineSegments(planeGeom, mat);
      frame.position.set(0, p === 0 ? 1.4 : p === 1 ? -0.6 : -2.0, 0);
      scene.add(frame);
      planeFrames.push(frame);
    }

    // Build composite 3-part node groups (core octahedron + wireframe CAD cage + orbital ring)
    const coreGeom = new THREE.OctahedronGeometry(1, 0);
    const cageGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 1.7, 1.7));
    const ringGeom = new THREE.TorusGeometry(1.35, 0.04, 8, 24);
    ringGeom.rotateX(Math.PI / 2);

    const nodeGroups: THREE.Group[] = [];
    const coreMeshes: THREE.Mesh[] = [];
    const cageLines: THREE.LineSegments[] = [];
    const nodePositions: THREE.Vector3[] = [];

    for (let i = 0; i < NODE_SPECS.length; i += 1) {
      const spec = NODE_SPECS[i];
      const group = new THREE.Group();
      group.position.set(spec.basePos[0], spec.basePos[1], spec.basePos[2]);

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xd4d4d8,
        metalness: 0.82,
        roughness: 0.22,
        emissive: 0x09090b,
        emissiveIntensity: 0.3,
      });
      const core = new THREE.Mesh(coreGeom, coreMat);
      core.scale.setScalar(spec.scale);
      group.add(core);
      coreMeshes.push(core);

      const cageMat = new THREE.LineBasicMaterial({
        color: 0x52525b,
        transparent: true,
        opacity: 0.55,
      });
      const cage = new THREE.LineSegments(cageGeom, cageMat);
      cage.scale.setScalar(spec.scale * 0.92);
      group.add(cage);
      cageLines.push(cage);

      if (spec.stepId || spec.id === 'window' || spec.id === 'form') {
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0x71717a,
          metalness: 0.9,
          roughness: 0.35,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.scale.setScalar(spec.scale * 1.15);
        group.add(ring);
      }

      scene.add(group);
      nodeGroups.push(group);
      nodePositions.push(new THREE.Vector3(spec.basePos[0], spec.basePos[1], spec.basePos[2]));
    }

    // Instanced auxiliary structural dust lattice (> 24 points for crisp CAD depth)
    const dustCount = 48;
    const dustGeom = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const dustMat = new THREE.MeshStandardMaterial({
      color: 0x3f3f46,
      metalness: 0.5,
      roughness: 0.6,
    });
    const dustMesh = new THREE.InstancedMesh(dustGeom, dustMat, dustCount);
    dustMesh.frustumCulled = false;
    for (let i = 0; i < dustCount; i += 1) {
      const angle = (i / dustCount) * Math.PI * 2;
      const radius = 5.5 + (i % 5) * 1.15;
      _vA.set(Math.cos(angle) * radius, ((i % 7) - 3) * 0.85, Math.sin(angle) * radius);
      _mat4.makeTranslation(_vA.x, _vA.y, _vA.z);
      dustMesh.setMatrixAt(i, _mat4);
    }
    dustMesh.instanceMatrix.needsUpdate = true;
    dustMesh.computeBoundingSphere();
    scene.add(dustMesh);

    // Dynamic edge segments connecting parent -> child DOM nodes
    const edgePairs: Array<[number, number]> = [];
    for (let i = 0; i < NODE_SPECS.length; i += 1) {
      const p = NODE_SPECS[i].parentIdx;
      if (p !== null) edgePairs.push([p, i]);
    }
    const edgePositions = new Float32Array(edgePairs.length * 6);
    const edgeColors = new Float32Array(edgePairs.length * 6);
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    edgeGeom.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
    });
    const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
    edgeLines.frustumCulled = false;
    scene.add(edgeLines);

    // Healing laser beam mesh (cylinder stretched between source form node and healed leaf node)
    const beamGeom = new THREE.CylinderGeometry(0.032, 0.032, 1, 8);
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.8,
      metalness: 0.2,
      roughness: 0.2,
      transparent: true,
      opacity: 0,
    });
    const healBeam = new THREE.Mesh(beamGeom, beamMat);
    healBeam.visible = false;
    scene.add(healBeam);

    // Scroll choreography state animated by GSAP ScrollTrigger
    const scrollRig = {
      explode: 0,
      camX: 4.2,
      camY: 2.1,
      camZ: 8.2,
      lookX: -2.6,
      lookY: 0.0,
      lookZ: 0,
      stageIndex: 0,
    };

    const stExplode = gsap.to(scrollRig, {
      explode: 1,
      camX: 1.4,
      camY: 1.0,
      camZ: 7.4,
      lookX: 0,
      lookY: -0.35,
      lookZ: 0,
      stageIndex: 1,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: {
        trigger: '#section-exploded',
        start: 'top bottom',
        end: 'center center',
        scrub: true,
      },
    });

    const stWorkbench = gsap.to(scrollRig, {
      explode: 0.22,
      camX: 2.6,
      camY: -0.6,
      camZ: 9.2,
      lookX: -0.4,
      lookY: -1.8,
      lookZ: 0,
      stageIndex: 2,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: {
        trigger: '#section-workbench',
        start: 'top bottom',
        end: 'top 20%',
        scrub: true,
      },
    });

    // Mouse parallax state
    const pointerTarget = { x: 0, y: 0 };
    const pointerSmooth = { x: 0, y: 0 };
    const handlePointerMove = (e: PointerEvent) => {
      pointerTarget.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointerTarget.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);
    };
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let disposed = false;
    let frameId = 0;
    let lastTelemetryTs = 0;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.getElapsedTime();
      const current = stateRef.current;

      // Exponential mouse damping
      const dampFactor = 1 - Math.exp(-5.0 * dt);
      pointerSmooth.x += (pointerTarget.x - pointerSmooth.x) * dampFactor;
      pointerSmooth.y += (pointerTarget.y - pointerSmooth.y) * dampFactor;

      const explode = scrollRig.explode;
      const isChaos = current.domVersion === 'v2';

      // Animate plane wireframe separators
      for (let p = 0; p < 3; p += 1) {
        const zShift = (p - 1) * explode * 3.4;
        const yBase = p === 0 ? 1.4 : p === 1 ? -0.6 : -2.0;
        planeFrames[p].position.set(0, yBase + (1 - p) * explode * 0.45, zShift);
        const pMat = planeFrames[p].material as THREE.LineBasicMaterial;
        pMat.opacity = 0.08 + explode * 0.48;
      }

      // Update nodes
      for (let i = 0; i < NODE_SPECS.length; i += 1) {
        const spec = NODE_SPECS[i];
        const group = nodeGroups[i];
        const core = coreMeshes[i];
        const cage = cageLines[i];
        const coreMat = core.material as THREE.MeshStandardMaterial;
        const cageMat = cage.material as THREE.LineBasicMaterial;

        const zPlane = (spec.layer - 1) * explode * 3.4;
        const yPlaneOffset = (1 - spec.layer) * explode * 0.45;
        const floatY = Math.sin(elapsed * 1.15 + i * 0.65) * 0.08;
        const chaosJitter =
          isChaos && spec.layer === 1
            ? Math.sin(elapsed * 6.5 + i * 2.1) * 0.09
            : 0;

        nodePositions[i].set(
          spec.basePos[0] + chaosJitter,
          spec.basePos[1] + yPlaneOffset + floatY,
          spec.basePos[2] + zPlane,
        );
        group.position.copy(nodePositions[i]);
        group.rotation.y += dt * (spec.layer === 2 ? 0.45 : 0.22);

        // Color state driven by real engine phase + DOM version
        const isActiveTarget = spec.stepId && spec.stepId === current.activeStepId;
        if (current.enginePhase === 'broken' && (isActiveTarget || (isChaos && spec.layer === 1))) {
          _cTarget.setHex(0xff4500);
          coreMat.emissive.setHex(0xff4500);
          coreMat.emissiveIntensity = 1.1;
          cageMat.color.setHex(0xff4500);
        } else if (
          (current.enginePhase === 'healing' || current.enginePhase === 'healed') &&
          (spec.layer === 2 || isActiveTarget)
        ) {
          _cTarget.setHex(0x10b981);
          coreMat.emissive.setHex(0x10b981);
          coreMat.emissiveIntensity = isActiveTarget ? 1.2 : 0.45;
          cageMat.color.setHex(0x10b981);
        } else if (current.enginePhase === 'running' && isActiveTarget) {
          _cTarget.setHex(0xf59e0b);
          coreMat.emissive.setHex(0xf59e0b);
          coreMat.emissiveIntensity = 0.95;
          cageMat.color.setHex(0xf59e0b);
        } else if (isChaos && spec.layer === 1) {
          _cTarget.setHex(0xff4500);
          coreMat.emissive.setHex(0x7c2d12);
          coreMat.emissiveIntensity = 0.55;
          cageMat.color.setHex(0xff4500);
        } else {
          _cTarget.setHex(spec.layer === 0 ? 0xf4f4f0 : 0xa1a1aa);
          coreMat.emissive.setHex(0x09090b);
          coreMat.emissiveIntensity = 0.25;
          cageMat.color.setHex(0x52525b);
        }
        coreMat.color.lerp(_cTarget, 0.16);
      }

      // Update dynamic edge buffer
      const posAttr = edgeGeom.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = edgeGeom.getAttribute('color') as THREE.BufferAttribute;
      for (let e = 0; e < edgePairs.length; e += 1) {
        const [pIdx, cIdx] = edgePairs[e];
        const pPos = nodePositions[pIdx];
        const cPos = nodePositions[cIdx];
        posAttr.setXYZ(e * 2, pPos.x, pPos.y, pPos.z);
        posAttr.setXYZ(e * 2 + 1, cPos.x, cPos.y, cPos.z);

        const cSpec = NODE_SPECS[cIdx];
        if (current.enginePhase === 'healed' && cSpec.layer === 2) {
          _cTarget.setHex(0x10b981);
        } else if (isChaos && cSpec.layer === 1) {
          _cTarget.setHex(0xff4500);
        } else {
          _cTarget.setHex(0x3f3f46);
        }
        colAttr.setXYZ(e * 2, _cTarget.r, _cTarget.g, _cTarget.b);
        colAttr.setXYZ(e * 2 + 1, _cTarget.r, _cTarget.g, _cTarget.b);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Healing beam connecting form#erp (idx 4) -> target leaf node
      const showBeam =
        current.enginePhase === 'healing' || current.enginePhase === 'healed';
      if (showBeam) {
        const targetIdx =
          NODE_SPECS.findIndex((n) => n.stepId === current.activeStepId) !== -1
            ? NODE_SPECS.findIndex((n) => n.stepId === current.activeStepId)
            : 15; // leaf-submit
        _vA.copy(nodePositions[4]);
        _vB.copy(nodePositions[targetIdx]);
        _vMid.addVectors(_vA, _vB).multiplyScalar(0.5);
        const dist = _vA.distanceTo(_vB);
        _scaleVec.copy(_vB).sub(_vA).normalize();
        _quat.setFromUnitVectors(_vUp, _scaleVec);

        healBeam.visible = true;
        healBeam.position.copy(_vMid);
        healBeam.quaternion.copy(_quat);
        healBeam.scale.set(1, dist, 1);
        beamMat.opacity = 0.85;
      } else {
        healBeam.visible = false;
        beamMat.opacity = 0;
      }

      // Camera orbit + scroll choreography + parallax
      const orbitAngle = elapsed * 0.12 * (1 - explode * 0.75);
      const targetCamX =
        scrollRig.camX * Math.cos(orbitAngle * 0.25) + pointerSmooth.x * 0.75;
      const targetCamY = scrollRig.camY - pointerSmooth.y * 0.45;
      const targetCamZ = scrollRig.camZ;

      camera.position.x += (targetCamX - camera.position.x) * 0.08;
      camera.position.y += (targetCamY - camera.position.y) * 0.08;
      camera.position.z += (targetCamZ - camera.position.z) * 0.08;
      camera.lookAt(scrollRig.lookX, scrollRig.lookY, scrollRig.lookZ);

      renderer.render(scene, camera);

      const now = performance.now();
      if (now - lastTelemetryTs > 260 && telemetryCbRef.current) {
        lastTelemetryTs = now;
        const stageLabel =
          scrollRig.explode > 0.55
            ? 'STAGE 02 · EXPLODED PLANE INSPECTION'
            : scrollRig.stageIndex >= 1.4
              ? 'STAGE 03 · DOCKED WORKBENCH TELEMETRY'
              : 'STAGE 01 · ARCHITECTURAL CAD ORBIT';
        telemetryCbRef.current({
          camX: Number(camera.position.x.toFixed(2)),
          camY: Number(camera.position.y.toFixed(2)),
          camZ: Number(camera.position.z.toFixed(2)),
          stageLabel,
          explodeFactor: Number(explode.toFixed(2)),
          nodeCount: NODE_SPECS.length,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      stExplode.kill();
      stWorkbench.kill();
      ScrollTrigger.getAll().forEach((t) => t.kill());

      coreGeom.dispose();
      cageGeom.dispose();
      ringGeom.dispose();
      planeGeom.dispose();
      dustGeom.dispose();
      dustMat.dispose();
      edgeGeom.dispose();
      edgeMat.dispose();
      beamGeom.dispose();
      beamMat.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div
      data-testid="spatial-dom-canvas"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#09090B]"
      aria-hidden="true"
    >
      {webglUnavailable ? (
        <div className="flex h-full w-full items-center justify-center swiss-grid-bg">
          <div className="border border-[#222226] bg-[#111113] px-6 py-4 font-mono-tech text-xs text-[#71717A]">
            WEBGL_CONTEXT_UNAVAILABLE · 2D CAD GRID FALLBACK ACTIVE
          </div>
        </div>
      ) : (
        <div ref={mountRef} className="h-full w-full" />
      )}
    </div>
  );
};
