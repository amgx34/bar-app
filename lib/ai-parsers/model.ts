/**
 * The model every Groq-backed parser calls.
 *
 * Named once because it was previously hardcoded in six call sites, and Groq
 * decommissioning `llama-3.3-70b-versatile` therefore broke all six at the same
 * moment — inventory import, shift import, shipment parsing, Z-report parsing,
 * the 2Touch email fallback and rep-reply parsing — with nothing in the code
 * connecting the failures to one cause.
 *
 * Groq retires hosted models on its own schedule, so expect to change this
 * again. Two constraints on any replacement:
 *
 *   - It must support `response_format: { type: 'json_object' }`. Every parser
 *     depends on it; a model without JSON mode returns prose that fails to
 *     parse rather than erroring cleanly.
 *   - Its context window must comfortably exceed MAX_MODEL_INPUT_CHARS
 *     (24,000 chars ≈ 6k tokens) in `guardrails.ts`.
 *
 * `client.models.list()` is the authoritative list of what is currently live —
 * the docs lag behind the decommissions.
 */
export const GROQ_PARSER_MODEL = 'openai/gpt-oss-120b';
