/**
 * Local check of the data against the listing's JSON Schema before anything
 * is submitted, so a bad response never costs an OutLayer fee. The verifier
 * in OutLayer runs its own check; this one only filters.
 */
import AjvDraft7 from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

// ajv is CommonJS with a `default` property; normalise the import across loaders.
type AjvLike = { compile(schema: unknown): ((data: unknown) => boolean) & { errors?: ErrorObject[] | null } };
type AjvCtor = new (opts: object) => AjvLike;
const ctor = (m: unknown): AjvCtor => ((m as { default?: AjvCtor }).default ?? m) as AjvCtor;

export type Check = (data: unknown) => { ok: true } | { ok: false; errors: string[] };

export function compileCondition(schema: unknown): Check {
  if (typeof schema !== "object" || schema === null) throw new Error("condition: a JSON Schema object");
  const draft = String((schema as { $schema?: unknown }).$schema ?? "");
  const Ajv = draft.includes("2020-12") ? ctor(Ajv2020) : ctor(AjvDraft7);
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  return (data) => {
    if (validate(data)) return { ok: true };
    const errors = (validate.errors ?? []).slice(0, 10).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
    return { ok: false, errors };
  };
}
