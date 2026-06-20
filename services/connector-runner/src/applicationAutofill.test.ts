import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicantProfileFromRecord,
  buildAutofillPlan,
  matchOption,
  scoreFieldAgainstApplicant,
  tokenize,
  type ApplicantProfile,
  type FormFieldDescriptor,
} from "./applicationAutofill.js";

function field(overrides: Partial<FormFieldDescriptor>): FormFieldDescriptor {
  return {
    ref: overrides.ref ?? "af-1",
    selector: overrides.selector ?? '[data-af-ref="af-1"]',
    fieldKind: overrides.fieldKind ?? "text",
    required: overrides.required ?? false,
    disabled: overrides.disabled ?? false,
    ...overrides,
  };
}

test("tokenize splits camelCase, snake_case, and punctuation", () => {
  assert.deepEqual(tokenize("firstName"), ["first", "name"]);
  assert.deepEqual(tokenize("project_title"), ["project", "title"]);
  assert.deepEqual(tokenize("Amount Requested ($)"), ["amount", "requested"]);
});

test("scoreFieldAgainstApplicant matches via default aliases", () => {
  const emailField = field({ label: "E-mail address", name: "contactEmail" });
  const result = scoreFieldAgainstApplicant(emailField, { key: "email", value: "a@b.com" });
  assert.ok(result.score >= 0.5, `expected a confident email match, got ${result.score}`);
});

test("scoreFieldAgainstApplicant does not match unrelated fields", () => {
  const cityField = field({ label: "City", name: "city" });
  const result = scoreFieldAgainstApplicant(cityField, { key: "projectTitle", value: "Quantum widgets" });
  assert.equal(result.score, 0);
});

test("matchOption resolves a select option from a value", () => {
  const options = [
    { value: "bc", label: "British Columbia" },
    { value: "on", label: "Ontario" },
  ];
  assert.deepEqual(matchOption(options, "British Columbia"), { value: "bc", label: "British Columbia" });
  assert.equal(matchOption(options, "Nunavut"), undefined);
});

test("buildAutofillPlan assigns confident matches and reports the rest", () => {
  const profile: ApplicantProfile = {
    fields: [
      { key: "firstName", value: "Ada" },
      { key: "email", value: "ada@example.org" },
      { key: "projectTitle", value: "Analytical engine" },
    ],
  };
  const fields = [
    field({ ref: "af-1", label: "First name", name: "first_name" }),
    field({ ref: "af-2", label: "Email", name: "email", inputType: "email" }),
    field({ ref: "af-3", label: "Mysterious internal code", name: "xyz123" }),
  ];

  const plan = buildAutofillPlan(fields, profile);

  const firstName = plan.assignments.find((entry) => entry.ref === "af-1");
  assert.equal(firstName?.value, "Ada");
  assert.equal(firstName?.sourceKey, "firstName");
  assert.ok(plan.assignments.some((entry) => entry.ref === "af-2" && entry.sourceKey === "email"));
  assert.ok(plan.unmatchedFields.some((entry) => entry.ref === "af-3"));
  assert.ok(plan.unusedProfileKeys.includes("projectTitle"));
});

test("buildAutofillPlan never fills file inputs and skips sensitive profile values", () => {
  const profile: ApplicantProfile = {
    fields: [
      { key: "sin", value: "123-456-789", sensitive: true },
      { key: "resume", value: "n/a" },
    ],
  };
  const fields = [field({ ref: "af-1", label: "Resume", name: "resume", fieldKind: "file" })];
  const plan = buildAutofillPlan(fields, profile);
  assert.equal(plan.assignments.length, 0);
  assert.ok(plan.unmatchedFields.some((entry) => entry.ref === "af-1"));
});

test("buildAutofillPlan maps select fields to an option value", () => {
  const profile: ApplicantProfile = { fields: [{ key: "province", value: "Ontario" }] };
  const fields = [
    field({
      ref: "af-1",
      label: "Province",
      name: "province",
      fieldKind: "select",
      options: [
        { value: "bc", label: "British Columbia" },
        { value: "on", label: "Ontario" },
      ],
    }),
  ];
  const plan = buildAutofillPlan(fields, profile);
  const assignment = plan.assignments.find((entry) => entry.ref === "af-1");
  assert.equal(assignment?.optionValue, "on");
});

test("applicantProfileFromRecord humanizes keys and drops empties", () => {
  const profile = applicantProfileFromRecord({ projectTitle: "Engine", note: "", skip: null });
  assert.equal(profile.fields.length, 1);
  assert.equal(profile.fields[0].key, "projectTitle");
  assert.equal(profile.fields[0].label, "project title");
});
