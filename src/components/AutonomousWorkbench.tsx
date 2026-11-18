import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Check,
  Code2,
  Cpu,
  Download,
  FileDiff,
  Play,
  RotateCcw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { sanitizeDomHtml, SanitizeResult } from '../engine/domSanitizer';
import {
  AutomationStep,
  deduceSelectorDeterministic,
  ERP_AUTOMATION_STEPS,
  HealingDeduction,
} from '../engine/heuristicHealer';
import {
  generateRunnablePythonScript,
  generateUnifiedGitDiff,
  HealedMapping,
} from '../engine/diffAndExport';
import { DomVersion, ErpFormValues, ErpHighlightState, ErpSandbox } from './ErpSandbox';
import { EnginePhase } from './SpatialDomCanvas';

export interface ExecutionLogEntry {
  id: string;
  ts: string;
  level: 'info' | 'warn' | 'error' | 'heal' | 'success';
  message: string;
}

interface AutonomousWorkbenchProps {
  domVersion: DomVersion;
  enginePhase: EnginePhase;
  activeStepId: string | null;
  onChangeDomVersion: (version: DomVersion) => void;
  onChangeEngineState: (phase: EnginePhase, activeStepId: string | null) => void;
}

const DEFAULT_VALUES: ErpFormValues = {
  vendor: '',
  amount: '',
  priority: 'standard-72h',
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function triggerBrowserDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const AutonomousWorkbench: React.FC<AutonomousWorkbenchProps> = ({
  domVersion,
  enginePhase,
  activeStepId,
  onChangeDomVersion,
  onChangeEngineState,
}) => {
  const sandboxRef = useRef<HTMLDivElement | null>(null);

  const [engineMode, setEngineMode] = useState<'auto' | 'heuristic'>('auto');
  const [activeTab, setActiveTab] = useState<'trace' | 'sanitizer' | 'deduction'>('trace');
  const [values, setValues] = useState<ErpFormValues>(DEFAULT_VALUES);
  const [highlight, setHighlight] = useState<ErpHighlightState>({
    activeStepId: null,
    brokenStepId: null,
    healedStepIds: [],
    submitted: false,
    poReference: null,
  });

  const [logs, setLogs] = useState<ExecutionLogEntry[]>([
    {
      id: 'init-1',
      ts: '00:00.000',
      level: 'info',
      message: 'Autonomous DOM Watcher initialized. Target: #target-sandbox-dom',
    },
  ]);
  const [sanitizeResult, setSanitizeResult] = useState<SanitizeResult | null>(null);
  const [deductions, setDeductions] = useState<
    Array<{ step: AutomationStep; deduction: HealingDeduction }>
  >([]);
  const [healedMappings, setHealedMappings] = useState<HealedMapping[]>([]);
  const [brokenCount, setBrokenCount] = useState(0);
  const [meanHealMs, setMeanHealMs] = useState(0);
  const [lastConfidence, setLastConfidence] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const appendLog = (level: ExecutionLogEntry['level'], message: string) => {
    const now = new Date();
    const ts = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    setLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, ts, level, message },
    ]);
  };

  const resetWorkbench = (nextVersion?: DomVersion) => {
    setIsRunning(false);
    setValues(DEFAULT_VALUES);
    setHighlight({
      activeStepId: null,
      brokenStepId: null,
      healedStepIds: [],
      submitted: false,
      poReference: null,
    });
    onChangeEngineState('idle', null);
    if (nextVersion) {
      onChangeDomVersion(nextVersion);
    }
    setLogs([
      {
        id: `reset-${Date.now()}`,
        ts: '00:00.000',
        level: 'info',
        message: `Workbench reset. Active DOM surface: ${(nextVersion ?? domVersion).toUpperCase()}`,
      },
    ]);
  };

  const handleToggleDomVersion = (target: DomVersion) => {
    setValues(DEFAULT_VALUES);
    setHighlight({
      activeStepId: null,
      brokenStepId: null,
      healedStepIds: [],
      submitted: false,
      poReference: null,
    });
    onChangeDomVersion(target);
    onChangeEngineState('idle', null);
    appendLog(
      target === 'v2' ? 'warn' : 'info',
      target === 'v2'
        ? 'CHAOS INJECTED: Legacy IDs stripped, nested .erp-v2-field-group wrappers mounted.'
        : 'DOM restored to State V1 (Stable Legacy Selectors).',
    );
  };

  const resolveSelectorWithAgent = async (
    step: AutomationStep,
    sanitizedHtml: string,
  ): Promise<HealingDeduction> => {
    if (engineMode === 'auto') {
      try {
        const res = await fetch('/api/heal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3500),
          body: JSON.stringify({
            failedSelector: step.legacySelector,
            stepIntent: step.intent,
            sanitizedDom: sanitizedHtml,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as HealingDeduction;
          if (data.newSelector && sandboxRef.current?.querySelector(data.newSelector)) {
            return data;
          }
        }
      } catch {
        // Transparent fallback to deterministic heuristic engine below
      }
    }
    return deduceSelectorDeterministic(step, sanitizedHtml);
  };

  const runAutomationPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setValues(DEFAULT_VALUES);
    setDeductions([]);
    setHealedMappings([]);
    setHighlight({
      activeStepId: null,
      brokenStepId: null,
      healedStepIds: [],
      submitted: false,
      poReference: null,
    });
    setLogs([]);

    appendLog('info', `Starting Playwright sequence on GlobalProcure ERP (${domVersion.toUpperCase()})...`);
    onChangeEngineState('running', null);

    let localBroken = 0;
    const healTimes: number[] = [];
    const collectedMappings: HealedMapping[] = [];
    const healedIds: string[] = [];
    let currentValues = { ...DEFAULT_VALUES };

    for (const step of ERP_AUTOMATION_STEPS) {
      setHighlight((prev) => ({ ...prev, activeStepId: step.id, brokenStepId: null }));
      onChangeEngineState('running', step.id);
      appendLog('info', `Step ${step.order}/4: ${step.label} -> awaiting selector "${step.legacySelector}"`);
      await wait(340);

      const sandboxEl = sandboxRef.current;
      const directMatch = sandboxEl?.querySelector(step.legacySelector) ?? null;
      let activeSelector = step.legacySelector;

      if (!directMatch) {
        localBroken += 1;
        setBrokenCount((prev) => prev + 1);
        setHighlight((prev) => ({ ...prev, brokenStepId: step.id }));
        onChangeEngineState('broken', step.id);
        appendLog(
          'error',
          `PlaywrightTimeoutError: Waiting for selector "${step.legacySelector}" failed (1500ms exceeded)`,
        );
        await wait(380);

        // 1. DOM Sanitizer
        const rawHtml = sandboxEl?.innerHTML ?? '';
        const sanitized = sanitizeDomHtml(rawHtml);
        setSanitizeResult(sanitized);
        appendLog(
          'warn',
          `DOM Sanitizer extracted ${sanitized.nodeCount} nodes (${sanitized.tokenReductionPct}% token reduction: ${sanitized.rawTokens} -> ${sanitized.sanitizedTokens} tokens).`,
        );

        // 2. Semantic Deduction
        onChangeEngineState('healing', step.id);
        const deduction = await resolveSelectorWithAgent(step, sanitized.sanitizedHtml);
        healTimes.push(deduction.latencyMs);
        setMeanHealMs(
          Math.round(healTimes.reduce((acc, v) => acc + v, 0) / healTimes.length),
        );
        setLastConfidence(deduction.confidence);
        setDeductions((prev) => [...prev, { step, deduction }]);

        appendLog(
          'heal',
          `[${deduction.provider}] Deduced "${deduction.newSelector}" (${deduction.confidence}% confidence, ${deduction.latencyMs}ms).`,
        );

        // 3. 3D Visual Lock + Retry
        activeSelector = deduction.newSelector;
        healedIds.push(step.id);
        collectedMappings.push({
          legacySelector: step.legacySelector,
          healedSelector: deduction.newSelector,
          action: step.action,
          sampleValue: step.sampleValue,
        });
        setHealedMappings([...collectedMappings]);
        setHighlight((prev) => ({
          ...prev,
          brokenStepId: null,
          healedStepIds: [...healedIds],
        }));
        onChangeEngineState('healed', step.id);
        await wait(360);
      }

      // Execute action against the live form control
      const targetControl = sandboxEl?.querySelector(activeSelector);
      if (targetControl) {
        if (step.id === 'step-vendor' && step.sampleValue) {
          currentValues = { ...currentValues, vendor: step.sampleValue };
          setValues(currentValues);
        } else if (step.id === 'step-amount' && step.sampleValue) {
          currentValues = { ...currentValues, amount: step.sampleValue };
          setValues(currentValues);
        } else if (step.id === 'step-priority' && step.sampleValue) {
          currentValues = { ...currentValues, priority: step.sampleValue };
          setValues(currentValues);
        } else if (step.id === 'step-submit') {
          const poRef = `PO-${Math.floor(100000 + Math.random() * 900000)}`;
          setHighlight((prev) => ({
            ...prev,
            activeStepId: null,
            submitted: true,
            poReference: poRef,
          }));
          appendLog(
            'success',
            `Purchase Order committed via ${activeSelector}. Reference: ${poRef}`,
          );
        }
      }
      await wait(240);
    }

    if (localBroken === 0) {
      const rawHtml = sandboxRef.current?.innerHTML ?? '';
      setSanitizeResult(sanitizeDomHtml(rawHtml));
    }

    onChangeEngineState(localBroken > 0 ? 'healed' : 'idle', null);
    setHighlight((prev) => ({ ...prev, activeStepId: null }));
    setIsRunning(false);
  };

  const { diffLines, rawPatchText } = useMemo(
    () => generateUnifiedGitDiff(healedMappings),
    [healedMappings],
  );

  const latestTokenReduction = sanitizeResult ? `${sanitizeResult.tokenReductionPct}%` : '—';
  const latestConfidence = lastConfidence !== null ? `${lastConfidence}%` : '—';

  return (
    <div className="space-y-6">
      {/* Workbench Control Strip */}
      <div className="flex flex-col gap-4 border border-[#222226] bg-[#111113] p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span className="font-mono-tech text-xs text-[#71717A] shrink-0">DOM STATE:</span>
          <div className="flex flex-col sm:inline-flex sm:flex-row border border-[#222226] bg-[#09090B]">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleToggleDomVersion('v1')}
              className={`px-3.5 py-2 font-mono-tech text-xs font-medium transition-colors whitespace-nowrap cursor-pointer text-left sm:text-center ${
                domVersion === 'v1'
                  ? 'bg-[#10B981] text-[#09090B] font-semibold'
                  : 'text-[#71717A] hover:text-[#F4F4F0]'
              }`}
            >
              V1 · Stable Legacy DOM
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleToggleDomVersion('v2')}
              className={`px-3.5 py-2 font-mono-tech text-xs font-medium transition-colors whitespace-nowrap cursor-pointer text-left sm:text-center border-t border-[#222226] sm:border-t-0 sm:border-l ${
                domVersion === 'v2'
                  ? 'bg-[#FF4500] text-[#F4F4F0] font-semibold'
                  : 'text-[#71717A] hover:text-[#F4F4F0]'
              }`}
            >
              V2 · Inject Chaos / Mutate DOM
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap border border-[#222226] bg-[#09090B]">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => setEngineMode('auto')}
              className={`px-3 py-2 font-mono-tech text-xs transition-colors whitespace-nowrap cursor-pointer ${
                engineMode === 'auto'
                  ? 'bg-[#222226] text-[#F4F4F0]'
                  : 'text-[#71717A] hover:text-[#F4F4F0]'
              }`}
            >
              AUTO (Gemini + Heuristic)
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => setEngineMode('heuristic')}
              className={`px-3 py-2 font-mono-tech text-xs transition-colors whitespace-nowrap cursor-pointer ${
                engineMode === 'heuristic'
                  ? 'bg-[#222226] text-[#F4F4F0]'
                  : 'text-[#71717A] hover:text-[#F4F4F0]'
              }`}
            >
              Heuristic Offline
            </button>
          </div>

          <button
            type="button"
            disabled={isRunning}
            onClick={runAutomationPipeline}
            className={`inline-flex items-center gap-2 border px-4 py-2 font-mono-tech text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              isRunning
                ? 'border-[#F59E0B] bg-[#F59E0B] text-[#09090B]'
                : 'border-[#F4F4F0] bg-[#F4F4F0] text-[#09090B] hover:bg-[#10B981] hover:border-[#10B981]'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            {isRunning ? 'RUNNING PIPELINE...' : 'RUN AUTOMATION PIPELINE'}
          </button>

          <button
            type="button"
            disabled={isRunning}
            onClick={() => resetWorkbench()}
            aria-label="Reset workbench"
            className="inline-flex items-center gap-1.5 border border-[#222226] bg-[#09090B] px-3 py-2 font-mono-tech text-xs text-[#71717A] transition-colors hover:border-[#F4F4F0] hover:text-[#F4F4F0] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Split-Screen Panels A & B */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-5 flex flex-col">
          <ErpSandbox
            domVersion={domVersion}
            values={values}
            highlight={highlight}
            onChangeValues={setValues}
            sandboxRef={sandboxRef}
            onManualSubmit={() => {
              const poRef = `PO-${Math.floor(100000 + Math.random() * 900000)}`;
              setHighlight((prev) => ({ ...prev, submitted: true, poReference: poRef }));
              appendLog('success', `Manual form submission committed. Reference: ${poRef}`);
            }}
          />
        </div>

        {/* Panel B: Autonomous Execution & Self-Healing Engine */}
        <div className="lg:col-span-7 flex flex-col border border-[#222226] bg-[#111113]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222226] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono-tech text-xs text-[#71717A]">PANEL B</span>
              <span className="text-[#222226]">/</span>
              <h3 className="font-display text-sm font-bold text-[#F4F4F0]">
                Autonomous Execution &amp; Self-Healing Engine
              </h3>
            </div>
            <div className="font-mono-tech text-xs">
              {enginePhase === 'broken' && (
                <span className="text-[#FF4500]">FAULT INTERCEPTED</span>
              )}
              {enginePhase === 'healing' && (
                <span className="text-[#F59E0B]">SEMANTIC DEDUCTION ACTIVE</span>
              )}
              {enginePhase === 'healed' && (
                <span className="text-[#10B981]">3D VISUAL LOCK · PATCH VERIFIED</span>
              )}
              {enginePhase === 'running' && (
                <span className="text-[#F59E0B]">EXECUTING: {activeStepId}</span>
              )}
              {enginePhase === 'idle' && (
                <span className="text-[#71717A]">STANDBY</span>
              )}
            </div>
          </div>

          {/* Inspector Tabs */}
          <div className="flex overflow-x-auto border-b border-[#222226] bg-[#09090B]">
            <button
              type="button"
              onClick={() => setActiveTab('trace')}
              className={`flex items-center gap-2 border-r border-[#222226] px-4 py-2.5 font-mono-tech text-xs transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'trace'
                  ? 'bg-[#111113] text-[#F4F4F0]'
                  : 'text-[#71717A] hover:text-[#F4F4F0]'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              Execution Trace
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sanitizer')}
              className={`flex items-center gap-2 border-r border-[#222226] px-4 py-2.5 font-mono-tech text-xs transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'sanitizer'
                  ? 'bg-[#111113] text-[#F4F4F0]'
                  : 'text-[#71717A] hover:text-[#F4F4F0]'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              DOM Sanitizer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('deduction')}
              className={`flex items-center gap-2 border-r border-[#222226] px-4 py-2.5 font-mono-tech text-xs transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'deduction'
                  ? 'bg-[#111113] text-[#F4F4F0]'
                  : 'text-[#71717A] hover:text-[#F4F4F0]'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              Semantic Deduction ({deductions.length})
            </button>
          </div>

          <div className="flex-1 p-4 font-mono-tech text-xs">
            {activeTab === 'trace' && (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {logs.map((entry) => {
                  const color =
                    entry.level === 'error'
                      ? 'text-[#FF4500]'
                      : entry.level === 'warn'
                        ? 'text-[#F59E0B]'
                        : entry.level === 'heal' || entry.level === 'success'
                          ? 'text-[#10B981]'
                          : 'text-[#A1A1AA]';
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 border-b border-[#222226]/60 pb-2"
                    >
                      <span className="shrink-0 text-[#71717A]">[{entry.ts}]</span>
                      <span className={color}>{entry.message}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'sanitizer' && (
              <div className="space-y-3">
                {sanitizeResult ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border border-[#222226] bg-[#09090B] px-3 py-2 text-[#71717A]">
                      <span>RAW: {sanitizeResult.rawTokens} tokens ({sanitizeResult.rawBytes} B)</span>
                      <span>SANITIZED: {sanitizeResult.sanitizedTokens} tokens</span>
                      <span className="text-[#10B981]">
                        REDUCTION: -{sanitizeResult.tokenReductionPct}%
                      </span>
                    </div>
                    <pre className="max-h-[280px] overflow-auto border border-[#222226] bg-[#09090B] p-3 text-[11px] leading-relaxed text-[#F4F4F0]">
                      {sanitizeResult.sanitizedHtml}
                    </pre>
                  </>
                ) : (
                  <div className="border border-[#222226] bg-[#09090B] p-6 text-center text-[#71717A]">
                    Run the automation pipeline to extract and sanitize the live target DOM tree.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'deduction' && (
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {deductions.length > 0 ? (
                  deductions.map(({ step, deduction }) => (
                    <div
                      key={step.id}
                      className="border border-[#222226] bg-[#09090B] p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[#F4F4F0] font-semibold">
                          Step {step.order}: {step.label}
                        </span>
                        <span className="text-[#10B981]">
                          CONFIDENCE {deduction.confidence}% · {deduction.latencyMs}ms · {deduction.provider}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="border border-[#FF4500]/40 bg-[#FF4500]/5 px-2.5 py-1.5 text-[#FF4500]">
                          BROKEN: {step.legacySelector}
                        </div>
                        <div className="border border-[#10B981]/40 bg-[#10B981]/5 px-2.5 py-1.5 text-[#10B981]">
                          HEALED: {deduction.newSelector}
                        </div>
                      </div>
                      <p className="text-[#71717A] leading-relaxed">{deduction.reasoning}</p>
                    </div>
                  ))
                ) : (
                  <div className="border border-[#222226] bg-[#09090B] p-6 text-center text-[#71717A]">
                    Switch to State V2 (Chaos Mode) and run the pipeline to inspect semantic selector deductions.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel C: Live Telemetry & Automated Git Patch */}
      <div className="border border-[#222226] bg-[#111113]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#222226] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono-tech text-xs text-[#71717A]">PANEL C</span>
            <span className="text-[#222226]">/</span>
            <h3 className="font-display text-sm font-bold text-[#F4F4F0]">
              Live Telemetry &amp; Automated Git Patch
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                triggerBrowserDownload(
                  'autoheal_selector_patch.diff',
                  rawPatchText,
                  'text/x-diff',
                )
              }
              className="inline-flex items-center gap-2 border border-[#222226] bg-[#09090B] px-3.5 py-2 font-mono-tech text-xs text-[#F4F4F0] transition-colors hover:border-[#10B981] hover:text-[#10B981] cursor-pointer whitespace-nowrap"
            >
              <FileDiff className="h-3.5 w-3.5" />
              DOWNLOAD GIT PATCH (.DIFF)
            </button>
            <button
              type="button"
              onClick={() =>
                triggerBrowserDownload(
                  'autoheal_playwright_runner.py',
                  generateRunnablePythonScript(healedMappings),
                  'text/x-python',
                )
              }
              className="inline-flex items-center gap-2 border border-[#F4F4F0] bg-[#F4F4F0] px-3.5 py-2 font-mono-tech text-xs font-semibold text-[#09090B] transition-colors hover:bg-[#10B981] hover:border-[#10B981] cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              EXPORT PLAYWRIGHT PYTHON SCRIPT
            </button>
          </div>
        </div>

        {/* 4 KPI Strip */}
        <div className="grid grid-cols-2 border-b border-[#222226] md:grid-cols-4">
          <div className="border-b border-r border-[#222226] p-4 md:border-b-0">
            <div className="flex items-center gap-2 font-mono-tech text-xs text-[#71717A]">
              <AlertOctagon className="h-3.5 w-3.5 text-[#FF4500]" />
              Broken Selectors Intercepted
            </div>
            <div
              data-testid="kpi-broken-count"
              className="mt-2 font-mono-tech text-2xl font-bold text-[#F4F4F0]"
            >
              {brokenCount}
            </div>
          </div>

          <div className="border-b border-[#222226] p-4 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 font-mono-tech text-xs text-[#71717A]">
              <Activity className="h-3.5 w-3.5 text-[#10B981]" />
              Token Reduction %
            </div>
            <div
              data-testid="kpi-token-reduction"
              className="mt-2 font-mono-tech text-2xl font-bold text-[#10B981]"
            >
              {latestTokenReduction}
            </div>
          </div>

          <div className="border-r border-[#222226] p-4">
            <div className="flex items-center gap-2 font-mono-tech text-xs text-[#71717A]">
              <ShieldAlert className="h-3.5 w-3.5 text-[#F59E0B]" />
              Mean Time To Heal (ms)
            </div>
            <div
              data-testid="kpi-mtth"
              className="mt-2 font-mono-tech text-2xl font-bold text-[#F4F4F0]"
            >
              {meanHealMs > 0 ? `${meanHealMs}ms` : '—'}
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-2 font-mono-tech text-xs text-[#71717A]">
              <Check className="h-3.5 w-3.5 text-[#10B981]" />
              Confidence Score
            </div>
            <div
              data-testid="kpi-confidence"
              className="mt-2 font-mono-tech text-2xl font-bold text-[#10B981]"
            >
              {latestConfidence}
            </div>
          </div>
        </div>

        {/* Unified Git Diff Viewer */}
        <div className="bg-[#09090B] p-4">
          <div className="mb-2 flex items-center justify-between font-mono-tech text-xs text-[#71717A]">
            <span>UNIFIED DIFF · workflow_v1.py → workflow_v1_healed.py</span>
            <span>
              {healedMappings.length > 0
                ? `${healedMappings.length} selectors patched from live run`
                : 'Preview diff (run V2 Chaos pipeline to generate live patch)'}
            </span>
          </div>
          <pre
            data-testid="git-diff-viewer"
            className="overflow-x-auto border border-[#222226] bg-[#111113] p-3 font-mono-tech text-xs leading-relaxed"
          >
            {diffLines.map((line, idx) => {
              const cls =
                line.type === 'removed'
                  ? 'bg-[#FF4500]/15 text-[#FF4500]'
                  : line.type === 'added'
                    ? 'bg-[#10B981]/15 text-[#10B981]'
                    : line.type === 'hunk'
                      ? 'text-[#F59E0B]'
                      : line.type === 'header'
                        ? 'text-[#71717A]'
                        : 'text-[#D4D4D8]';
              return (
                <div key={idx} className={`px-2 ${cls}`}>
                  {line.text}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
};
