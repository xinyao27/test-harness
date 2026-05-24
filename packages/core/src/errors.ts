import { Data } from "effect";

export class HarnessConfigFileReadError extends Data.TaggedError("HarnessConfigFileReadError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class HarnessConfigYamlParseError extends Data.TaggedError("HarnessConfigYamlParseError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class HarnessConfigSchemaDecodeError extends Data.TaggedError(
  "HarnessConfigSchemaDecodeError",
)<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export type HarnessConfigLoadError =
  | HarnessConfigFileReadError
  | HarnessConfigYamlParseError
  | HarnessConfigSchemaDecodeError;

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
  readonly index: number;
}> {}

export class PromisesFileSchemaDecodeError extends Data.TaggedError(
  "PromisesFileSchemaDecodeError",
)<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export type PromiseRecordLoadError =
  | PromiseFileReadError
  | PromiseYamlParseError
  | PromisesFileSchemaDecodeError
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

export class ModuleFileReadError extends Data.TaggedError("ModuleFileReadError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class ModuleYamlParseError extends Data.TaggedError("ModuleYamlParseError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export class ModuleSchemaDecodeError extends Data.TaggedError("ModuleSchemaDecodeError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export type ModuleRecordLoadError =
  | ModuleFileReadError
  | ModuleYamlParseError
  | ModuleSchemaDecodeError;

export class ModuleRecordLoadErrors extends Data.TaggedError("ModuleRecordLoadErrors")<{
  readonly errors: readonly ModuleRecordLoadError[];
}> {}

export class SourceFileScanError extends Data.TaggedError("SourceFileScanError")<{
  readonly cause: unknown;
  readonly path: string;
}> {}

export type HarnessError =
  | HarnessConfigLoadError
  | PromiseFileReadError
  | PromiseRecordLoadErrors
  | InvalidScenarioBindingError
  | TestResultsLoadError
  | ModuleFileReadError
  | ModuleRecordLoadErrors
  | SourceFileScanError;
