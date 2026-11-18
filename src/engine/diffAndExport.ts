export interface HealedMapping {
  legacySelector: string;
  healedSelector: string;
  action: 'fill' | 'select' | 'click';
  sampleValue?: string;
}

export interface DiffLine {
  type: 'header' | 'hunk' | 'context' | 'removed' | 'added';
  text: string;
  lineOld?: number;
  lineNew?: number;
}

export function buildPlaywrightScripts(mappings: HealedMapping[]): {
  originalScript: string;
  healedScript: string;
} {
  const defaultMappings: HealedMapping[] =
    mappings.length > 0
      ? mappings
      : [
          {
            legacySelector: '#vendor-name',
            healedSelector: 'input[name="supplier_entity_code"]',
            action: 'fill',
            sampleValue: 'Kestrel Precision Logistics GmbH',
          },
          {
            legacySelector: '#po-amount',
            healedSelector: 'input[name="po_valuation_usd"]',
            action: 'fill',
            sampleValue: '148500',
          },
          {
            legacySelector: '#priority-select',
            healedSelector: 'select[name="dispatch_sla_tier"]',
            action: 'select',
            sampleValue: 'expedited-24h',
          },
          {
            legacySelector: '#submit-order-btn',
            healedSelector: 'button[data-qa-action="commit-ledger-entry"]',
            action: 'click',
          },
        ];

  const renderBody = (useHealed: boolean) =>
    defaultMappings
      .map((m) => {
        const sel = useHealed ? m.healedSelector : m.legacySelector;
        const quote = sel.includes('"') ? "'" : '"';
        if (m.action === 'fill') {
          return `    page.fill(${quote}${sel}${quote}, "${m.sampleValue ?? ''}")`;
        }
        if (m.action === 'select') {
          return `    page.select_option(${quote}${sel}${quote}, "${m.sampleValue ?? ''}")`;
        }
        return `    page.click(${quote}${sel}${quote})`;
      })
      .join('\n');

  const header = [
    'from playwright.sync_api import sync_playwright',
    '',
    'def commit_purchase_order(portal_url: str) -> None:',
    '  with sync_playwright() as p:',
    '    browser = p.chromium.launch(headless=True)',
    '    page = browser.new_page()',
    '    page.goto(portal_url)',
  ].join('\n');

  const footer = [
    '    page.wait_for_selector("[data-ledger-status=\'committed\']")',
    '    browser.close()',
  ].join('\n');

  return {
    originalScript: `${header}\n${renderBody(false)}\n${footer}`,
    healedScript: `${header}\n${renderBody(true)}\n${footer}`,
  };
}

export function generateUnifiedGitDiff(mappings: HealedMapping[]): {
  diffLines: DiffLine[];
  rawPatchText: string;
} {
  const { originalScript, healedScript } = buildPlaywrightScripts(mappings);
  const oldLines = originalScript.split('\n');
  const newLines = healedScript.split('\n');

  const diffLines: DiffLine[] = [
    { type: 'header', text: 'diff --git a/workflow_v1.py b/workflow_v1_healed.py' },
    { type: 'header', text: 'index 4a81e0c..9f3d2b1 100644' },
    { type: 'header', text: '--- a/workflow_v1.py' },
    { type: 'header', text: '+++ b/workflow_v1_healed.py' },
    {
      type: 'hunk',
      text: `@@ -1,${oldLines.length} +1,${newLines.length} @@ def commit_purchase_order(portal_url: str) -> None:`,
    },
  ];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let oldNum = 1;
  let newNum = 1;

  for (let i = 0; i < maxLen; i += 1) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === newLine) {
      diffLines.push({
        type: 'context',
        text: ` ${oldLine}`,
        lineOld: oldNum,
        lineNew: newNum,
      });
      oldNum += 1;
      newNum += 1;
    } else {
      if (oldLine !== undefined) {
        diffLines.push({
          type: 'removed',
          text: `-${oldLine}`,
          lineOld: oldNum,
        });
        oldNum += 1;
      }
      if (newLine !== undefined) {
        diffLines.push({
          type: 'added',
          text: `+${newLine}`,
          lineNew: newNum,
        });
        newNum += 1;
      }
    }
  }

  return {
    diffLines,
    rawPatchText: `${diffLines.map((l) => l.text).join('\n')}\n`,
  };
}

export function generateRunnablePythonScript(mappings: HealedMapping[]): string {
  const { healedScript } = buildPlaywrightScripts(mappings);
  return `"""
AutoHeal-Agent Autonomous Self-Healing Playwright + Gemini Runner
Generated from live DOM mutation telemetry.
"""
import os
import json
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from google import genai
from google.genai import types

GEMINI_MODEL = "gemini-4-hydrogen"


def deduce_healed_selector(failed_selector: str, step_intent: str, raw_html: str) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Set GEMINI_API_KEY environment variable before invoking live healing.")

    client = genai.Client(api_key=api_key)
    prompt = (
        f"Failed Playwright selector: {failed_selector}\\n"
        f"Intent: {step_intent}\\n"
        f"Sanitized DOM:\\n{raw_html[:6000]}"
    )
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            system_instruction="Return JSON with keys: newSelector, confidence, reasoning.",
        ),
    )
    return json.loads(response.text)


${healedScript}


if __name__ == "__main__":
    target_url = os.environ.get("ERP_PORTAL_URL", "http://localhost:3000")
    try:
        commit_purchase_order(target_url)
        print("[AutoHeal] Purchase Order workflow completed cleanly.")
    except PlaywrightTimeoutError as exc:
        print(f"[AutoHeal] Intercepted selector failure: {exc}")
`;
}
