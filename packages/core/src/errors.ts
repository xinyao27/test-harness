import { Data } from "effect";

export class PromiseFileReadError extends Data.TaggedError("PromiseFileReadError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class PromiseYamlParseError extends Data.TaggedError("PromiseYamlParseError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class PromiseSchemaDecodeError extends Data.TaggedError("PromiseSchemaDecodeError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export type PromiseRecordLoadError =
  | PromiseFileReadError
  | PromiseYamlParseError
  | PromiseSchemaDecodeError;

export class PromiseRecordLoadErrors extends Data.TaggedError("PromiseRecordLoadErrors")<{
  readonly errors: readonly PromiseRecordLoadError[];
}> {}

export class InvalidScenarioBindingError extends Data.TaggedError("InvalidScenarioBindingError")<{
  readonly cause: unknown;
}> {}

export class TestResultsFileReadError extends Data.TaggedError("TestResultsFileReadError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class TestResultsYamlParseError extends Data.TaggedError("TestResultsYamlParseError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class TestResultsSchemaDecodeError extends Data.TaggedError("TestResultsSchemaDecodeError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export type TestResultsLoadError =
  | TestResultsFileReadError
  | TestResultsYamlParseError
  | TestResultsSchemaDecodeError;

export type HarnessError =
  | PromiseFileReadError
  | PromiseRecordLoadErrors
  | InvalidScenarioBindingError
  | TestResultsLoadError;
