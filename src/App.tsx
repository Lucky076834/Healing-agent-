import { useCallback, useState } from 'react';
import { ArrowDownRight, Crosshair } from 'lucide-react';
import { TopBar } from './components/TopBar';
import {
  EnginePhase,
  SpatialDomCanvas,
  TelemetrySnapshot,
} from './components/SpatialDomCanvas';
import { DomVersion } from './components/ErpSandbox';
import { AutonomousWorkbench } from './components/AutonomousWorkbench';

export default function App() {
  const [domVersion, setDomVersion] = useState<DomVersion>('v1');
  const [enginePhase, setEnginePhase] = useState<EnginePhase>('idle');
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({
    camX: 7.2,
    camY: 3.4,
    camZ: 8.6,
    stageLabel: 'STAGE 01 · ARCHITECTURAL CAD ORBIT',
    explodeFactor: 0,
    nodeCount: 20,
  });

  const handleEngineState = useCallback(
    (phase: EnginePhase, stepId: string | null) => {
      setEnginePhase(phase);
      setActiveStepId(stepId);
    },
    [],
  );

  const jumpToWorkbench = () => {
    const el = document.getElementById('section-workbench');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative min-h-screen bg-[#09090B] text-[#F4F4F0]">
      {/* Persistent Three.js WebGL Canvas synchronized with GSAP ScrollTrigger */}
      <SpatialDomCanvas
        sceneState={{ domVersion, enginePhase, activeStepId }}
        onTelemetry={setTelemetry}
      />

      {/* Foreground Semantic Architectural Layer */}
      <div className="relative z-10 flex flex-col">
        <TopBar onJumpToWorkbench={jumpToWorkbench} />

        <main className="mx-auto w-full max-w-[1440px] border-x border-[#222226]">
          {/* SECTION 01: Hero — Architectural Overview */}
          <section
            id="section-hero"
            className="scroll-mt-16 relative flex min-h-[92vh] flex-col justify-between border-b border-[#222226] p-6 md:p-10"
          >
            {/* Corner Crosshairs & Live CAD Coordinates */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#222226] pb-4 font-mono-tech text-xs text-[#71717A]">
              <div className="flex items-center gap-2 text-[#10B981]">
                <span aria-hidden="true">+</span>
                <span>SYS.STATUS: ONLINE // DOM_WATCHER_ACTIVE</span>
              </div>
              <div className="flex items-center gap-4">
                <span>
                  CAM [{telemetry.camX.toFixed(1)}, {telemetry.camY.toFixed(1)},{' '}
                  {telemetry.camZ.toFixed(1)}]
                </span>
                <span className="hidden sm:inline">NODES: {telemetry.nodeCount}</span>
                <span aria-hidden="true">+</span>
              </div>
            </div>

            {/* Hero Split Layout leaving right side open for the 3D Spatial DOM Lattice */}
            <div className="my-auto grid grid-cols-1 gap-8 py-12 lg:grid-cols-12">
              <div className="lg:col-span-7 bg-[#09090B]/85 border border-[#222226] p-6 md:p-8">
                <p className="font-mono-tech text-xs tracking-wider text-[#71717A]">
                  01. ARCHITECTURAL OVERVIEW · SPATIAL DOM ENGINE
                </p>
                <h1
                  className="mt-4 font-display text-4xl font-bold leading-[1.06] tracking-tight text-[#F4F4F0] sm:text-5xl lg:text-6xl"
                  style={{ textWrap: 'balance' }}
                >
                  Autonomous Self-Healing Browser &amp; DOM Automation
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#A1A1AA]">
                  Intercept brittle selector failures in real time. Sanitize mutated
                  production trees, deduce resilient CSS targets with semantic
                  reasoning, lock onto live DOM coordinates, and emit verified Git
                  patches automatically.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-6">
                  <button
                    type="button"
                    onClick={jumpToWorkbench}
                    className="inline-flex items-center gap-2 border border-[#FF4500] bg-[#FF4500] px-5 py-3 font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#F4F4F0] transition-colors hover:bg-[#F4F4F0] hover:border-[#F4F4F0] hover:text-[#09090B] cursor-pointer whitespace-nowrap"
                  >
                    Enter Mission Control
                    <ArrowDownRight className="h-4 w-4" />
                  </button>
                  <div className="font-mono-tech text-xs text-[#71717A]">
                    SCROLL TO EXPLODE DOM PLANES ↓
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#222226] pt-4 font-mono-tech text-xs text-[#71717A]">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">+</span>
                <span>{telemetry.stageLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>LATENCY BUDGET: &lt; 200ms</span>
                <span aria-hidden="true">+</span>
              </div>
            </div>
          </section>

          {/* SECTION 02: Scroll Transition — Exploded Layer Inspection */}
          <section
            id="section-exploded"
            className="scroll-mt-16 relative min-h-[115vh] border-b border-[#222226] p-6 md:p-10 flex flex-col justify-between"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#222226] pb-4 font-mono-tech text-xs text-[#71717A]">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">+</span>
                <span>02. EXPLODED LAYER INSPECTION · THREE-PLANE SEPARATION</span>
              </div>
              <span>EXPLODE RATIO: {(telemetry.explodeFactor * 100).toFixed(0)}%</span>
            </div>

            <div className="my-auto grid grid-cols-1 gap-6 py-12 md:grid-cols-3">
              <div className="border border-[#222226] bg-[#111113]/92 p-6">
                <div className="font-mono-tech text-xs text-[#71717A]">
                  PLANE 01 · Z = -3.4
                </div>
                <h2 className="mt-2 font-display text-xl font-bold text-[#F4F4F0]">
                  Legacy Selector Plane
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
                  Baseline Playwright automation scripts pinned to brittle hardcoded IDs
                  such as <code className="font-mono-tech text-[#F4F4F0]">#vendor-name</code> and{' '}
                  <code className="font-mono-tech text-[#F4F4F0]">#submit-order-btn</code>.
                </p>
              </div>

              <div className="border border-[#FF4500]/60 bg-[#111113]/92 p-6">
                <div className="font-mono-tech text-xs text-[#FF4500]">
                  PLANE 02 · Z = 0.0
                </div>
                <h2 className="mt-2 font-display text-xl font-bold text-[#F4F4F0]">
                  Mutated Chaos Plane
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
                  Production frontend deploys strip legacy IDs and wrap inputs inside
                  nested <code className="font-mono-tech text-[#FF4500]">.erp-v2-field-group</code>{' '}
                  containers, fracturing selector paths.
                </p>
              </div>

              <div className="border border-[#10B981]/60 bg-[#111113]/92 p-6">
                <div className="font-mono-tech text-xs text-[#10B981]">
                  PLANE 03 · Z = +3.4
                </div>
                <h2 className="mt-2 font-display text-xl font-bold text-[#F4F4F0]">
                  Semantic Healer Plane
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
                  Sanitized DOM tokens feed semantic vector pathfinding to lock onto{' '}
                  <code className="font-mono-tech text-[#10B981]">
                    button[data-qa-action=&quot;commit-ledger-entry&quot;]
                  </code>{' '}
                  with zero manual intervention.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#222226] pt-4 font-mono-tech text-xs text-[#71717A]">
              <span>+ CAMERA VECTOR LOCKED TO SCROLL AXIS</span>
              <span>WORKBENCH TELEMETRY NEXT ↓ +</span>
            </div>
          </section>

          {/* SECTION 03: Interactive Workbench & Chaos Sandbox */}
          <section
            id="section-workbench"
            className="scroll-mt-16 relative bg-transparent p-6 md:p-10"
          >
            {/* Docked 3D Telemetry Viewport Window + Section Header */}
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-between border border-[#222226] bg-[#111113]/95 p-5">
                <div>
                  <p className="font-mono-tech text-xs text-[#71717A]">
                    03. MISSION CONTROL WORKBENCH · LIVE CHAOS SANDBOX
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-bold text-[#F4F4F0]">
                    Autonomous Self-Healing Pipeline
                  </h2>
                  <p className="mt-2 text-sm text-[#A1A1AA]">
                    Toggle DOM chaos to physically strip legacy IDs inside GlobalProcure ERP,
                    run the automation sequence, and inspect real-time 3D vector pathfinding.
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[#222226] pt-3 font-mono-tech text-xs">
                  <div className="flex items-center gap-2 text-[#71717A]">
                    <Crosshair className="h-3.5 w-3.5 text-[#F4F4F0]" />
                    <span>
                      CAM [{telemetry.camX.toFixed(1)}, {telemetry.camY.toFixed(1)},{' '}
                      {telemetry.camZ.toFixed(1)}]
                    </span>
                  </div>
                  <span
                    className={
                      enginePhase === 'broken'
                        ? 'text-[#FF4500]'
                        : enginePhase === 'healed'
                          ? 'text-[#10B981]'
                          : enginePhase === 'running' || enginePhase === 'healing'
                            ? 'text-[#F59E0B]'
                            : 'text-[#71717A]'
                    }
                  >
                    PHASE: {enginePhase.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Open transparent CAD cutout exposing the docked 3D Spatial DOM Lattice */}
              <div className="lg:col-span-6 relative min-h-[210px] border border-[#222226] bg-transparent p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between font-mono-tech text-xs text-[#71717A]">
                  <span>+ DOCKED 3D TELEMETRY VIEWPORT</span>
                  <span
                    className={
                      domVersion === 'v2' ? 'text-[#FF4500]' : 'text-[#10B981]'
                    }
                  >
                    {domVersion === 'v2' ? 'FRACTURE ALERT · V2' : 'LATTICE NOMINAL · V1'}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono-tech text-xs text-[#71717A]">
                  <span>
                    {activeStepId
                      ? `ACTIVE TARGET: ${activeStepId}`
                      : 'TARGET LOCK: STANDBY'}
                  </span>
                  <span>+</span>
                </div>
              </div>
            </div>

            <div className="bg-[#09090B]/90">
              <AutonomousWorkbench
                domVersion={domVersion}
                enginePhase={enginePhase}
                activeStepId={activeStepId}
                onChangeDomVersion={setDomVersion}
                onChangeEngineState={handleEngineState}
              />
            </div>
          </section>
        </main>

        <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4 border-x border-t border-[#222226] bg-[#09090B] px-6 py-5 font-mono-tech text-xs text-[#71717A]">
          <span>AutoHeal-Agent · Autonomous Browser &amp; DOM Automation Workbench</span>
          <span>Matte Obsidian #09090B · Swiss-Grid CAD Architecture</span>
        </footer>
      </div>
    </div>
  );
}
