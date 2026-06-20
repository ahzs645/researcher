import type { Page } from "playwright";
import { z } from "zod";
import { ConnectorActionError } from "./connectorActionError.js";
import type {
  ConnectorActionContext,
  ConnectorManifest,
  ConnectorProvider,
} from "./connectors.js";

// Assisted autofill for external grant and scholarship application portals.
//
// This connector deliberately stops short of submitting anything. It reads the
// form on the live, human-authenticated page (analyzeForm), maps an applicant
// profile onto the discovered fields, and pre-fills them for the person to
// review (fillForm). The same fillForm action also accepts an explicit list of
// assignments, which is the seam an LLM planner plugs into later without
// touching the browser-execution code.

export type FormFieldKind = "text" | "textarea" | "select" | "checkbox" | "radio" | "file" | "other";

export type FormFieldOption = {
  value: string;
  label: string;
};

export type FormFieldDescriptor = {
  ref: string;
  selector: string;
  fieldKind: FormFieldKind;
  inputType?: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  group?: string;
  required: boolean;
  disabled: boolean;
  currentValue?: string;
  maxLength?: number;
  options?: FormFieldOption[];
};

export type ApplicantField = {
  key: string;
  label?: string;
  value: string;
  aliases?: string[];
  sensitive?: boolean;
};

export type ApplicantProfile = {
  fields: ApplicantField[];
};

export type AutofillAssignment = {
  ref?: string;
  selector: string;
  fieldKind: FormFieldKind;
  fieldLabel?: string;
  fieldName?: string;
  sourceKey: string;
  value: string;
  optionValue?: string;
  confidence: number;
  reason: string;
};

export type AutofillPlan = {
  assignments: AutofillAssignment[];
  unmatchedFields: Array<Pick<FormFieldDescriptor, "ref" | "label" | "name" | "fieldKind" | "required">>;
  unusedProfileKeys: string[];
};

// Common application-form vocabulary. Canonical keys here let a flat record of
// applicant data line up with portals that phrase the same field differently.
export const DEFAULT_FIELD_ALIASES: Record<string, string[]> = {
  firstName: ["first name", "given name", "forename"],
  lastName: ["last name", "surname", "family name"],
  fullName: ["full name", "name", "applicant name", "legal name"],
  email: ["email", "e-mail", "email address", "contact email"],
  phone: ["phone", "telephone", "phone number", "mobile", "cell"],
  organizationName: ["organization", "organisation", "institution", "employer", "company", "affiliation"],
  addressLine1: ["address", "street address", "address line 1", "mailing address"],
  city: ["city", "town", "municipality"],
  province: ["province", "state", "region"],
  postalCode: ["postal code", "zip", "zip code", "post code"],
  country: ["country"],
  projectTitle: ["project title", "title", "proposal title", "application title", "research title"],
  projectSummary: ["summary", "abstract", "project summary", "description", "project description", "research summary"],
  amountRequested: ["amount requested", "requested amount", "funding requested", "budget", "amount", "grant amount"],
  startDate: ["start date", "project start", "anticipated start"],
  endDate: ["end date", "project end", "anticipated end"],
  fieldOfStudy: ["field of study", "discipline", "research area", "area of study", "subject"],
  orcid: ["orcid", "orcid id"],
  website: ["website", "url", "web site", "homepage"],
};

const STOPWORDS = new Set([
  "the", "your", "please", "field", "enter", "a", "an", "of", "for", "to", "and",
  "or", "is", "in", "on", "with", "this", "that", "you", "we", "if", "select",
  "optional", "required", "value", "type", "name",
]);

export function tokenize(value: string | undefined): string[] {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-./\\]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && (token.length > 1 || /[0-9]/.test(token)));
}

function meaningfulTokens(value: string | undefined): string[] {
  return tokenize(value).filter((token) => !STOPWORDS.has(token));
}

function fieldHaystack(field: FormFieldDescriptor): Set<string> {
  return new Set([
    ...meaningfulTokens(field.label),
    ...meaningfulTokens(field.ariaLabel),
    ...meaningfulTokens(field.name),
    ...meaningfulTokens(field.id),
    ...meaningfulTokens(field.placeholder),
    ...meaningfulTokens(field.group),
  ]);
}

// Coverage of a needle phrase by the field's vocabulary: what fraction of the
// needle's meaningful tokens appear on the field.
function coverage(needleTokens: string[], haystack: Set<string>): number {
  if (needleTokens.length === 0) return 0;
  const matched = needleTokens.filter((token) => haystack.has(token)).length;
  return matched / needleTokens.length;
}

export function scoreFieldAgainstApplicant(
  field: FormFieldDescriptor,
  applicant: ApplicantField,
): { score: number; matchedTokens: number } {
  const haystack = fieldHaystack(field);
  if (haystack.size === 0) return { score: 0, matchedTokens: 0 };

  const aliasList = applicant.aliases ?? DEFAULT_FIELD_ALIASES[applicant.key] ?? [];
  const needleGroups = [
    meaningfulTokens(applicant.key),
    meaningfulTokens(applicant.label),
    ...aliasList.map((alias) => meaningfulTokens(alias)),
  ].filter((tokens) => tokens.length > 0);

  let bestScore = 0;
  let bestMatched = 0;
  for (const tokens of needleGroups) {
    const score = coverage(tokens, haystack);
    const matched = tokens.filter((token) => haystack.has(token)).length;
    if (score > bestScore || (score === bestScore && matched > bestMatched)) {
      bestScore = score;
      bestMatched = matched;
    }
  }
  return { score: bestScore, matchedTokens: bestMatched };
}

// For selects and radio groups, pick the option that best reflects the applicant
// value (handles "Yes"/"No", province names, etc.).
export function matchOption(options: FormFieldOption[] | undefined, value: string): FormFieldOption | undefined {
  if (!options || options.length === 0) return undefined;
  const valueTokens = meaningfulTokens(value);
  if (valueTokens.length === 0) return undefined;

  let best: FormFieldOption | undefined;
  let bestScore = 0;
  for (const option of options) {
    const optionTokens = new Set([...meaningfulTokens(option.label), ...meaningfulTokens(option.value)]);
    if (optionTokens.size === 0) continue;
    const forward = coverage(valueTokens, optionTokens);
    const backward = coverage([...optionTokens], new Set(valueTokens));
    const score = Math.max(forward, backward);
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return bestScore >= 0.5 ? best : undefined;
}

const TRUTHY_VALUES = new Set(["true", "yes", "y", "1", "on", "checked", "agree", "accept"]);

export type BuildAutofillPlanOptions = {
  minConfidence?: number;
};

export function buildAutofillPlan(
  fields: FormFieldDescriptor[],
  profile: ApplicantProfile,
  options: BuildAutofillPlanOptions = {},
): AutofillPlan {
  const minConfidence = options.minConfidence ?? 0.5;
  const assignments: AutofillAssignment[] = [];
  const unmatchedFields: AutofillPlan["unmatchedFields"] = [];
  const usedKeys = new Set<string>();
  const applicants = profile.fields.filter((applicant) => !applicant.sensitive && applicant.value.trim().length > 0);

  for (const field of fields) {
    if (field.disabled || field.fieldKind === "file") {
      unmatchedFields.push(toUnmatched(field));
      continue;
    }

    let best: { applicant: ApplicantField; score: number; matched: number } | undefined;
    for (const applicant of applicants) {
      const { score, matchedTokens } = scoreFieldAgainstApplicant(field, applicant);
      if (!best || score > best.score || (score === best.score && matchedTokens > best.matched)) {
        best = { applicant, score, matched: matchedTokens };
      }
    }

    if (!best || best.score < minConfidence) {
      unmatchedFields.push(toUnmatched(field));
      continue;
    }

    const assignment = buildAssignment(field, best.applicant, best.score);
    if (!assignment) {
      unmatchedFields.push(toUnmatched(field));
      continue;
    }
    assignments.push(assignment);
    usedKeys.add(best.applicant.key);
  }

  const unusedProfileKeys = applicants
    .map((applicant) => applicant.key)
    .filter((key) => !usedKeys.has(key));

  return { assignments, unmatchedFields, unusedProfileKeys };
}

function toUnmatched(field: FormFieldDescriptor): AutofillPlan["unmatchedFields"][number] {
  return { ref: field.ref, label: field.label, name: field.name, fieldKind: field.fieldKind, required: field.required };
}

function buildAssignment(
  field: FormFieldDescriptor,
  applicant: ApplicantField,
  score: number,
): AutofillAssignment | undefined {
  const base = {
    ref: field.ref,
    selector: field.selector,
    fieldKind: field.fieldKind,
    fieldLabel: field.label,
    fieldName: field.name,
    sourceKey: applicant.key,
    value: applicant.value,
  };

  if (field.fieldKind === "select" || field.fieldKind === "radio") {
    const option = matchOption(field.options, applicant.value);
    if (!option) {
      return {
        ...base,
        confidence: Math.min(score, 0.4),
        reason: `Matched field "${field.label ?? field.name ?? field.ref}" to "${applicant.key}", but no option matched value "${applicant.value}". Needs manual selection.`,
      };
    }
    return {
      ...base,
      value: option.label,
      optionValue: option.value,
      confidence: score,
      reason: `Matched "${applicant.key}" to ${field.fieldKind} "${field.label ?? field.name ?? field.ref}" → option "${option.label}".`,
    };
  }

  if (field.fieldKind === "checkbox") {
    return {
      ...base,
      value: TRUTHY_VALUES.has(applicant.value.trim().toLowerCase()) ? "true" : "false",
      confidence: score,
      reason: `Matched "${applicant.key}" to checkbox "${field.label ?? field.name ?? field.ref}".`,
    };
  }

  return {
    ...base,
    confidence: score,
    reason: `Matched "${applicant.key}" to "${field.label ?? field.name ?? field.ref}".`,
  };
}

// Flatten an applicant data record (camelCase or labelled keys) into profile
// fields, humanizing the key into a label so matching has something to read.
export function applicantProfileFromRecord(record: Record<string, unknown>): ApplicantProfile {
  const fields: ApplicantField[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (raw == null) continue;
    const value = typeof raw === "string" ? raw : String(raw);
    if (value.trim().length === 0) continue;
    fields.push({
      key,
      label: tokenize(key).join(" "),
      value,
    });
  }
  return { fields };
}

const applicantFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  value: z.string(),
  aliases: z.array(z.string()).optional(),
  sensitive: z.boolean().optional(),
});

const applicantProfileSchema = z.object({
  fields: z.array(applicantFieldSchema),
});

const assignmentInputSchema = z.object({
  ref: z.string().optional(),
  selector: z.string().min(1),
  fieldKind: z.enum(["text", "textarea", "select", "checkbox", "radio", "file", "other"]).optional(),
  value: z.string(),
  optionValue: z.string().optional(),
  sourceKey: z.string().optional(),
  reason: z.string().optional(),
});

export const analyzeFormProfileSchema = z.object({
  profileKey: z.string().min(1),
  url: z.string().url(),
  waitForSelector: z.string().optional(),
});

export const activeAnalyzeFormSchema = z.object({
  url: z.string().url().optional(),
  waitForSelector: z.string().optional(),
});

export const fillFormProfileSchema = z.object({
  profileKey: z.string().min(1),
  url: z.string().url().optional(),
  applicantProfile: applicantProfileSchema.optional(),
  assignments: z.array(assignmentInputSchema).optional(),
  minConfidence: z.number().min(0).max(1).default(0.5),
  highlight: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

export const activeFillFormSchema = fillFormProfileSchema.omit({ profileKey: true });

const APPLICATION_AUTOFILL_ID = "application-autofill";

export const applicationAutofillConnector: ConnectorManifest = {
  id: APPLICATION_AUTOFILL_ID,
  name: "Application autofill",
  category: "Grant applications",
  description:
    "Assisted autofill for grant and scholarship application portals. Reads the form, pre-fills it from an applicant profile, and leaves submission to the human reviewer. Never submits.",
  auth: {
    startUrl: "about:blank",
    allowedOrigins: [],
    profileKeyPrefix: "application",
    confirmMode: "profile",
  },
  actions: [
    {
      id: "analyzeForm",
      name: "Analyze form",
      description: "Read the visible application form and return its fields, labels, options, and stable selectors.",
    },
    {
      id: "fillForm",
      name: "Fill form",
      description: "Pre-fill the live application form from an applicant profile or explicit assignments for human review. Never submits.",
    },
  ],
  utility: {
    title: "Assisted application autofill",
    description: "Open a grant or scholarship portal in the live browser, then analyze and pre-fill the form for review.",
    steps: [
      "Open the application portal in the live browser and finish any login.",
      "Run Analyze form to capture the form fields and selectors.",
      "Run Fill form to pre-fill from the applicant profile, then review and submit manually.",
    ],
  },
};

// Browser-side scripts are kept as string templates so this service can stay on
// Node-only TypeScript libs (no DOM types) like the other connectors.
const ANALYZE_FORM_SCRIPT = `(() => {
  const clean = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };
  const labelFor = (element) => {
    if (element.id) {
      const explicit = document.querySelector('label[for="' + (window.CSS ? CSS.escape(element.id) : element.id) + '"]');
      if (explicit) return clean(explicit.textContent);
    }
    const wrapping = element.closest("label");
    if (wrapping) return clean(wrapping.textContent);
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\\s+/).map((id) => clean(document.getElementById(id)?.textContent)).filter(Boolean).join(" ");
      if (text) return text;
    }
    const previous = element.previousElementSibling;
    if (previous && /label|span|legend|p|div/i.test(previous.tagName)) {
      const text = clean(previous.textContent);
      if (text && text.length <= 120) return text;
    }
    return "";
  };

  const SENSITIVE = /password|social insurance|\\bsin\\b|account number|routing|card number|cvv|security code|bank|direct deposit/i;
  const isSensitive = (parts) => SENSITIVE.test(parts.filter(Boolean).join(" "));

  let refCounter = 0;
  const nextRef = (element) => {
    let ref = element.getAttribute("data-af-ref");
    if (!ref) {
      ref = "af-" + (refCounter += 1);
      element.setAttribute("data-af-ref", ref);
    }
    return ref;
  };
  const selectorFor = (ref) => '[data-af-ref="' + ref + '"]';

  const fields = [];
  const radioGroups = new Map();
  const controls = [...document.querySelectorAll("input, textarea, select")];

  for (const element of controls) {
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") || (tag === "select" ? "select" : "text")).toLowerCase();
    if (["hidden", "submit", "button", "image", "reset", "file"].includes(type) && type !== "file") continue;
    if (!isVisible(element) && type !== "radio" && type !== "checkbox") continue;

    const name = element.getAttribute("name") || "";
    const id = element.getAttribute("id") || "";
    const label = labelFor(element);
    const placeholder = element.getAttribute("placeholder") || "";
    const ariaLabel = element.getAttribute("aria-label") || "";
    const sensitive = type === "password" || isSensitive([name, id, label, placeholder, ariaLabel]);
    if (sensitive) continue;

    if (type === "radio") {
      const key = name || nextRef(element);
      const optionLabel = label || clean(element.value) || placeholder;
      if (!radioGroups.has(key)) {
        radioGroups.set(key, { ref: nextRef(element), name, options: [], checkedValue: undefined, groupLabel: "" });
      }
      const group = radioGroups.get(key);
      group.options.push({ value: element.value, label: optionLabel });
      if (element.checked) group.checkedValue = element.value;
      const fieldset = element.closest("fieldset");
      const legend = fieldset ? clean(fieldset.querySelector("legend")?.textContent) : "";
      if (!group.groupLabel && legend) group.groupLabel = legend;
      continue;
    }

    if (tag === "select") {
      const options = [...element.querySelectorAll("option")]
        .map((option) => ({ value: option.value, label: clean(option.textContent) }))
        .filter((option) => option.value !== "" || option.label !== "");
      fields.push({
        ref: nextRef(element), selector: selectorFor(nextRef(element)),
        fieldKind: "select", inputType: "select", name, id, label, placeholder, ariaLabel,
        required: element.required === true, disabled: element.disabled === true,
        currentValue: element.value || undefined, options,
      });
      continue;
    }

    const fieldKind = tag === "textarea" ? "textarea" : type === "checkbox" ? "checkbox" : "text";
    fields.push({
      ref: nextRef(element), selector: selectorFor(nextRef(element)),
      fieldKind, inputType: type, name, id, label, placeholder, ariaLabel,
      required: element.required === true, disabled: element.disabled === true,
      currentValue: type === "checkbox" ? (element.checked ? "true" : "false") : (element.value || undefined),
      maxLength: element.maxLength && element.maxLength > 0 ? element.maxLength : undefined,
    });
  }

  for (const group of radioGroups.values()) {
    fields.push({
      ref: group.ref, selector: selectorFor(group.ref),
      fieldKind: "radio", inputType: "radio", name: group.name, label: group.groupLabel || undefined,
      required: false, disabled: false, currentValue: group.checkedValue, group: group.name,
      options: group.options,
    });
  }

  const forms = [...document.querySelectorAll("form")].map((form) => ({
    action: form.getAttribute("action") || undefined,
    method: (form.getAttribute("method") || "get").toLowerCase(),
    fieldCount: form.querySelectorAll("input, textarea, select").length,
  }));

  return {
    url: location.href,
    title: document.title,
    formCount: forms.length,
    forms,
    fieldCount: fields.length,
    fields,
  };
})()`;

function buildFillScript(assignments: AutofillAssignment[], highlight: boolean) {
  const payload = JSON.stringify({ assignments, highlight });
  return `(() => {
    const payload = ${payload};
    const results = [];
    const setNativeValue = (element, value) => {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const markFilled = (element) => {
      if (!payload.highlight) return;
      element.style.outline = "2px solid #2563eb";
      element.style.outlineOffset = "1px";
      element.setAttribute("data-af-filled", "true");
    };

    for (const assignment of payload.assignments) {
      const result = { ref: assignment.ref, selector: assignment.selector, sourceKey: assignment.sourceKey };
      let element = null;
      try {
        element = document.querySelector(assignment.selector);
      } catch {
        element = null;
      }
      if (!element && assignment.ref) element = document.querySelector('[data-af-ref="' + assignment.ref + '"]');
      if (!element) { results.push({ ...result, status: "not_found" }); continue; }
      if (element.disabled) { results.push({ ...result, status: "skipped", reason: "disabled" }); continue; }

      const tag = element.tagName.toLowerCase();
      const type = (element.getAttribute("type") || (tag === "select" ? "select" : "text")).toLowerCase();
      element.focus();

      if (tag === "select") {
        const target = assignment.optionValue ?? assignment.value;
        const option = [...element.querySelectorAll("option")].find((candidate) =>
          candidate.value === target || candidate.textContent.trim() === target);
        if (!option) { results.push({ ...result, status: "no_option", attempted: target }); continue; }
        element.value = option.value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        markFilled(element);
        results.push({ ...result, status: "filled", value: option.textContent.trim() });
        continue;
      }

      if (type === "radio") {
        const target = assignment.optionValue ?? assignment.value;
        const radios = [...document.querySelectorAll('input[type="radio"][name="' + (element.getAttribute("name") || "") + '"]')];
        const radio = radios.find((candidate) => candidate.value === target) ?? radios.find((candidate) =>
          (document.querySelector('label[for="' + candidate.id + '"]')?.textContent || "").trim() === target);
        if (!radio) { results.push({ ...result, status: "no_option", attempted: target }); continue; }
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        radio.dispatchEvent(new Event("click", { bubbles: true }));
        markFilled(radio);
        results.push({ ...result, status: "filled", value: target });
        continue;
      }

      if (type === "checkbox") {
        const shouldCheck = assignment.value === "true" || assignment.value === true;
        element.checked = shouldCheck;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        markFilled(element);
        results.push({ ...result, status: "filled", value: shouldCheck ? "checked" : "unchecked" });
        continue;
      }

      setNativeValue(element, assignment.value);
      markFilled(element);
      results.push({ ...result, status: "filled", value: assignment.value });
    }

    const filledCount = results.filter((entry) => entry.status === "filled").length;
    return { filledCount, attemptedCount: payload.assignments.length, results };
  })()`;
}

async function navigateIfNeeded(page: Page, url: string | undefined, waitForSelector: string | undefined, requireUrl: boolean) {
  if (!url && requireUrl) {
    throw new ConnectorActionError(
      400,
      "autofill_url_required",
      "A url is required when running application autofill without a live browser session.",
    );
  }
  if (url && (requireUrl || page.url() !== url)) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 10_000 }).catch(() => undefined);
  }
}

export async function runAnalyzeApplicationForm(page: Page, input: any, context: ConnectorActionContext) {
  await navigateIfNeeded(page, input.url, input.waitForSelector, context.mode === "profile");
  const analysis: any = await page.evaluate(ANALYZE_FORM_SCRIPT);
  return {
    currentUrl: page.url(),
    title: await page.title().catch(() => undefined),
    ...analysis,
  };
}

export async function runFillApplicationForm(page: Page, input: any, context: ConnectorActionContext) {
  if (context.mode !== "session") {
    throw new ConnectorActionError(
      409,
      "fill_requires_live_session",
      "Fill form requires a live, signed-in browser session. Start a live session, open the application portal, then run fill form.",
    );
  }
  if (!input.assignments && !input.applicantProfile) {
    throw new ConnectorActionError(
      400,
      "autofill_input_required",
      "Provide either an applicantProfile to plan from or an explicit assignments array.",
    );
  }

  await navigateIfNeeded(page, input.url, undefined, false);
  const analysis: any = await page.evaluate(ANALYZE_FORM_SCRIPT);
  const fields = (analysis.fields ?? []) as FormFieldDescriptor[];

  let plan: AutofillPlan | undefined;
  let assignments: AutofillAssignment[];
  if (input.assignments) {
    assignments = (input.assignments as any[]).map((entry) => ({
      ref: entry.ref,
      selector: entry.selector,
      fieldKind: entry.fieldKind ?? "other",
      sourceKey: entry.sourceKey ?? "explicit",
      value: entry.value,
      optionValue: entry.optionValue,
      confidence: 1,
      reason: entry.reason ?? "Explicit assignment.",
    }));
  } else {
    plan = buildAutofillPlan(fields, input.applicantProfile, { minConfidence: input.minConfidence });
    assignments = plan.assignments;
  }

  if (input.dryRun) {
    return {
      dryRun: true,
      currentUrl: page.url(),
      title: await page.title().catch(() => undefined),
      fieldCount: fields.length,
      plan: plan ?? { assignments, unmatchedFields: [], unusedProfileKeys: [] },
    };
  }

  const fillResult: any = await page.evaluate(buildFillScript(assignments, input.highlight ?? true));
  return {
    submitted: false,
    currentUrl: page.url(),
    title: await page.title().catch(() => undefined),
    fieldCount: fields.length,
    plan: plan ?? { assignments, unmatchedFields: [], unusedProfileKeys: [] },
    ...fillResult,
  };
}

export const applicationAutofillProvider: ConnectorProvider = {
  manifest: applicationAutofillConnector,
  actions: {
    analyzeForm: {
      inputSchema: analyzeFormProfileSchema,
      activeInputSchema: activeAnalyzeFormSchema,
      run: runAnalyzeApplicationForm,
    },
    fillForm: {
      inputSchema: fillFormProfileSchema,
      activeInputSchema: activeFillFormSchema,
      run: runFillApplicationForm,
    },
  },
};
