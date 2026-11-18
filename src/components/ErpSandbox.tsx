import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

export type DomVersion = 'v1' | 'v2';

export interface ErpFormValues {
  vendor: string;
  amount: string;
  priority: string;
}

export interface ErpHighlightState {
  activeStepId: string | null;
  brokenStepId: string | null;
  healedStepIds: string[];
  submitted: boolean;
  poReference: string | null;
}

interface ErpSandboxProps {
  domVersion: DomVersion;
  values: ErpFormValues;
  highlight: ErpHighlightState;
  onChangeValues: (next: ErpFormValues) => void;
  onManualSubmit: () => void;
  sandboxRef: React.RefObject<HTMLDivElement | null>;
}

export const ErpSandbox: React.FC<ErpSandboxProps> = ({
  domVersion,
  values,
  highlight,
  onChangeValues,
  onManualSubmit,
  sandboxRef,
}) => {
  const getFieldBorderClass = (stepId: string) => {
    if (highlight.brokenStepId === stepId) {
      return 'border-[#FF4500] ring-1 ring-[#FF4500] bg-[#FF4500]/10';
    }
    if (highlight.activeStepId === stepId) {
      return 'border-[#F59E0B] ring-1 ring-[#F59E0B] bg-[#F59E0B]/10';
    }
    if (highlight.healedStepIds.includes(stepId)) {
      return 'border-[#10B981] ring-1 ring-[#10B981]/70 bg-[#10B981]/5';
    }
    return 'border-[#222226] bg-[#09090B]';
  };

  const getButtonClass = () => {
    if (highlight.brokenStepId === 'step-submit') {
      return 'border-[#FF4500] bg-[#FF4500]/20 text-[#F4F4F0] ring-1 ring-[#FF4500]';
    }
    if (highlight.activeStepId === 'step-submit') {
      return 'border-[#F59E0B] bg-[#F59E0B] text-[#09090B]';
    }
    if (highlight.healedStepIds.includes('step-submit') || highlight.submitted) {
      return 'border-[#10B981] bg-[#10B981] text-[#09090B]';
    }
    return 'border-[#F4F4F0] bg-[#F4F4F0] text-[#09090B] hover:bg-[#10B981] hover:border-[#10B981]';
  };

  return (
    <div className="flex flex-col border border-[#222226] bg-[#111113]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222226] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono-tech text-xs text-[#71717A]">PANEL A</span>
          <span className="text-[#222226]">/</span>
          <h3 className="font-display text-sm font-bold text-[#F4F4F0]">
            GlobalProcure ERP
          </h3>
        </div>
        <div className="flex items-center gap-2 font-mono-tech text-xs">
          {domVersion === 'v1' ? (
            <span className="flex items-center gap-1.5 text-[#10B981]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              STATE V1 · LEGACY IDS
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[#FF4500]">
              <ShieldAlert className="h-3.5 w-3.5" />
              STATE V2 · MUTATED DOM
            </span>
          )}
        </div>
      </div>

      {/* Isolated target DOM sandbox that the sanitizer & executor inspect */}
      <div
        id="target-sandbox-dom"
        ref={sandboxRef}
        data-dom-state={domVersion}
        data-testid="target-sandbox-dom"
        className="p-5"
      >
        {domVersion === 'v1' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onManualSubmit();
            }}
          >
            <div>
              <label
                htmlFor="vendor-name"
                className="mb-1.5 block font-mono-tech text-xs text-[#71717A]"
              >
                Supplier Entity
              </label>
              <input
                id="vendor-name"
                type="text"
                value={values.vendor}
                onChange={(e) => onChangeValues({ ...values, vendor: e.target.value })}
                placeholder="Enter corporate supplier..."
                className={`w-full border px-3 py-2.5 font-mono-tech text-sm text-[#F4F4F0] placeholder-[#71717A]/60 transition-colors focus:outline-none focus:border-[#F4F4F0] ${getFieldBorderClass('step-vendor')}`}
              />
            </div>

            <div>
              <label
                htmlFor="po-amount"
                className="mb-1.5 block font-mono-tech text-xs text-[#71717A]"
              >
                Purchase Order Valuation (USD)
              </label>
              <input
                id="po-amount"
                type="number"
                value={values.amount}
                onChange={(e) => onChangeValues({ ...values, amount: e.target.value })}
                placeholder="0.00"
                className={`w-full border px-3 py-2.5 font-mono-tech text-sm text-[#F4F4F0] placeholder-[#71717A]/60 transition-colors focus:outline-none focus:border-[#F4F4F0] ${getFieldBorderClass('step-amount')}`}
              />
            </div>

            <div>
              <label
                htmlFor="priority-select"
                className="mb-1.5 block font-mono-tech text-xs text-[#71717A]"
              >
                Dispatch SLA Tier
              </label>
              <select
                id="priority-select"
                value={values.priority}
                onChange={(e) => onChangeValues({ ...values, priority: e.target.value })}
                className={`w-full border px-3 py-2.5 font-mono-tech text-sm text-[#F4F4F0] transition-colors focus:outline-none focus:border-[#F4F4F0] ${getFieldBorderClass('step-priority')}`}
              >
                <option value="standard-72h">Standard Freight (72h SLA)</option>
                <option value="expedited-24h">Expedited Air (24h SLA)</option>
                <option value="critical-6h">Critical Charter (6h SLA)</option>
              </select>
            </div>

            <div className="pt-2">
              <button
                id="submit-order-btn"
                type="submit"
                className={`w-full border px-4 py-2.5 font-mono-tech text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${getButtonClass()}`}
              >
                Authorize &amp; Commit PO
              </button>
            </div>
          </form>
        ) : (
          <div className="erp-v2-shell space-y-4">
            <div className="erp-v2-banner flex items-center gap-2 border border-[#FF4500]/40 bg-[#FF4500]/10 px-3 py-2 font-mono-tech text-xs text-[#FF4500]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>DOM_MUTATION_ACTIVE: Legacy IDs stripped · Nested wrappers injected</span>
            </div>

            <form
              className="erp-v2-ledger-form space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                onManualSubmit();
              }}
            >
              <div className="erp-v2-field-group">
                <div className="erp-v2-inner-frame">
                  <label className="mb-1.5 block font-mono-tech text-xs text-[#71717A]">
                    Supplier Entity
                    <input
                      type="text"
                      name="supplier_entity_code"
                      aria-label="Supplier Entity"
                      value={values.vendor}
                      onChange={(e) => onChangeValues({ ...values, vendor: e.target.value })}
                      placeholder="Enter corporate entity..."
                      className={`mt-1.5 w-full border px-3 py-2.5 font-mono-tech text-sm text-[#F4F4F0] placeholder-[#71717A]/60 transition-colors focus:outline-none focus:border-[#F4F4F0] ${getFieldBorderClass('step-vendor')}`}
                    />
                  </label>
                </div>
              </div>

              <div className="erp-v2-field-group">
                <div className="erp-v2-inner-frame">
                  <label className="mb-1.5 block font-mono-tech text-xs text-[#71717A]">
                    Purchase Order Valuation (USD)
                    <input
                      type="number"
                      name="po_valuation_usd"
                      aria-label="Purchase Order Valuation"
                      value={values.amount}
                      onChange={(e) => onChangeValues({ ...values, amount: e.target.value })}
                      placeholder="0.00"
                      className={`mt-1.5 w-full border px-3 py-2.5 font-mono-tech text-sm text-[#F4F4F0] placeholder-[#71717A]/60 transition-colors focus:outline-none focus:border-[#F4F4F0] ${getFieldBorderClass('step-amount')}`}
                    />
                  </label>
                </div>
              </div>

              <div className="erp-v2-field-group">
                <div className="erp-v2-inner-frame">
                  <label className="mb-1.5 block font-mono-tech text-xs text-[#71717A]">
                    Dispatch SLA Tier
                    <select
                      name="dispatch_sla_tier"
                      aria-label="Dispatch SLA Tier"
                      value={values.priority}
                      onChange={(e) => onChangeValues({ ...values, priority: e.target.value })}
                      className={`mt-1.5 w-full border px-3 py-2.5 font-mono-tech text-sm text-[#F4F4F0] transition-colors focus:outline-none focus:border-[#F4F4F0] ${getFieldBorderClass('step-priority')}`}
                    >
                      <option value="standard-72h">Standard Freight (72h SLA)</option>
                      <option value="expedited-24h">Expedited Air (24h SLA)</option>
                      <option value="critical-6h">Critical Charter (6h SLA)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="erp-v2-actions pt-2">
                <button
                  type="submit"
                  data-qa-action="commit-ledger-entry"
                  className={`w-full border px-4 py-2.5 font-mono-tech text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${getButtonClass()}`}
                >
                  Authorize &amp; Commit PO
                </button>
              </div>
            </form>
          </div>
        )}

        {highlight.submitted && highlight.poReference && (
          <div
            data-ledger-status="committed"
            className="mt-4 border border-[#10B981] bg-[#10B981]/10 px-3.5 py-2.5 font-mono-tech text-xs text-[#10B981]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">LEDGER COMMITTED · {highlight.poReference}</span>
              <span>${Number(values.amount || 0).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-[#F4F4F0]/80">
              {values.vendor} · {values.priority}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
