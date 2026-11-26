/**
 * VIWANDA submission workflow diagnostics (for development, never UI).
 * NEVER log Authorization headers, bearer tokens, whole request bodies or personal data.
 * A phase is always recorded alongside its specific URL and HTTP status.
 * COMPONENT -> SERVICE -> API -> LARAVEL -> RETURN TO COMPONENT.
 */
import {apiError} from '../API/resourceHelpers.js';

export function checkedDatasetId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Select a dataset before continuing.');
  }
  return id;
}
export function workflowFailure(stage, path, error) {
  // Retain the original axios response for field-level messages and debugging.
  // Never prepend [STAGE] /route | HTTP xxx to text displayed to users.
  const failure = new Error(apiError(error));
  failure.response = error?.response;
  failure.cause = error;
  failure.workflowStage = stage;
  failure.workflowPath = path;
  return failure;
}
