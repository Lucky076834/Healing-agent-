import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDomHtml } from './domSanitizer';
import {
  ERP_AUTOMATION_STEPS,
  deduceSelectorDeterministic,
} from './heuristicHealer';
import {
  generateUnifiedGitDiff,
  generateRunnablePythonScript,
} from './diffAndExport';

const MUTATED_DOM_SAMPLE = `
  <div class="p-6 bg-zinc-900 rounded-none border border-zinc-800 shadow-none">
    <!-- Decorative comment that should be stripped -->
    <svg class="w-4 h-4"><path d="M0 0 L10 10" /></svg>
    <div class="erp-v2-field-group flex flex-col gap-2">
      <label class="text-xs uppercase tracking-wider">Supplier Entity</label>
      <input type="text" name="supplier_entity_code" placeholder="Enter corporate entity..." class="px-3 py-2 bg-black" />
    </div>
    <div class="erp-v2-field-group flex flex-col gap-2">
      <label class="text-xs uppercase tracking-wider">Purchase Order Valuation (USD)</label>
      <input type="number" name="po_valuation_usd" placeholder="0.00" class="px-3 py-2 bg-black" />
    </div>
    <div class="erp-v2-field-group flex flex-col gap-2">
      <label class="text-xs uppercase tracking-wider">Dispatch SLA Tier</label>
      <select name="dispatch_sla_tier" class="px-3 py-2 bg-black">
        <option value="standard-72h">Standard 72h</option>
        <option value="expedited-24h">Expedited 24h</option>
      </select>
    </div>
    <div class="erp-v2-actions pt-4">
      <button type="submit" data-qa-action="commit-ledger-entry" class="bg-emerald-600 text-white px-4 py-2">
        Authorize &amp; Commit PO
      </button>
    </div>
  </div>
`;

test('sanitizeDomHtml strips noise attributes, comments, and svg while keeping semantic attributes', () => {
  const result = sanitizeDomHtml(MUTATED_DOM_SAMPLE);
  assert.ok(!result.sanitizedHtml.includes('<!--'));
  assert.ok(!result.sanitizedHtml.includes('<svg'));
  assert.ok(!result.sanitizedHtml.includes('class='));
  assert.ok(result.sanitizedHtml.includes('name="supplier_entity_code"'));
  assert.ok(result.sanitizedHtml.includes('data-qa-action="commit-ledger-entry"'));
  assert.ok(result.tokenReductionPct > 20);
  assert.ok(result.sanitizedTokens < result.rawTokens);
});

test('deduceSelectorDeterministic heals all four mutated ERP selectors with high confidence', () => {
  const { sanitizedHtml } = sanitizeDomHtml(MUTATED_DOM_SAMPLE);

  const vendorHeal = deduceSelectorDeterministic(ERP_AUTOMATION_STEPS[0], sanitizedHtml);
  assert.equal(vendorHeal.newSelector, 'input[name="supplier_entity_code"]');
  assert.ok(vendorHeal.confidence >= 95);

  const amountHeal = deduceSelectorDeterministic(ERP_AUTOMATION_STEPS[1], sanitizedHtml);
  assert.equal(amountHeal.newSelector, 'input[name="po_valuation_usd"]');
  assert.ok(amountHeal.confidence >= 95);

  const slaHeal = deduceSelectorDeterministic(ERP_AUTOMATION_STEPS[2], sanitizedHtml);
  assert.equal(slaHeal.newSelector, 'select[name="dispatch_sla_tier"]');
  assert.ok(slaHeal.confidence >= 95);

  const submitHeal = deduceSelectorDeterministic(ERP_AUTOMATION_STEPS[3], sanitizedHtml);
  assert.equal(submitHeal.newSelector, 'button[data-qa-action="commit-ledger-entry"]');
  assert.ok(submitHeal.confidence >= 95);
});

test('generateUnifiedGitDiff and generateRunnablePythonScript emit valid patch and Python code', () => {
  const mappings = [
    {
      legacySelector: '#submit-order-btn',
      healedSelector: 'button[data-qa-action="commit-ledger-entry"]',
      action: 'click' as const,
    },
  ];
  const { diffLines, rawPatchText } = generateUnifiedGitDiff(mappings);
  assert.ok(diffLines.some((l) => l.type === 'removed' && l.text.includes('#submit-order-btn')));
  assert.ok(
    diffLines.some(
      (l) => l.type === 'added' && l.text.includes('button[data-qa-action="commit-ledger-entry"]'),
    ),
  );
  assert.ok(rawPatchText.includes('--- a/workflow_v1.py'));
  assert.ok(rawPatchText.includes('+++ b/workflow_v1_healed.py'));

  const py = generateRunnablePythonScript(mappings);
  assert.ok(py.includes('from playwright.sync_api import sync_playwright'));
  assert.ok(py.includes('button[data-qa-action="commit-ledger-entry"]'));
});
