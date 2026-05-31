import {
  runCucumber,
  type IRunEnvironment,
  type IRunOptions,
  type IRunResult,
} from "@cucumber/cucumber/api";
import {
  PickleStepType,
  TestStepResultStatus,
  type Envelope,
  type GherkinDocument,
  type Pickle,
  type PickleStep,
  type Step,
  type TestCase,
  type TestStepFinished,
} from "@cucumber/messages";

export type ExampleStatus = "passing" | "failing" | "skipped";

export type StepResult = {
  keyword: "Given" | "When" | "Then" | "And" | "But";
  text: string;
  status: ExampleStatus;
  failureMessage?: string;
};

export type ExampleResult = {
  feature: string;
  rule: string;
  example: string;
  locale: string;
  name: string;
  file: string;
  line?: number;
  status: ExampleStatus;
  steps: StepResult[];
  failureMessage?: string;
  labels?: Record<string, string>;
};

export type BridgeDescriptor = {
  name: "harness-cucumber-js";
  version: string;
  framework: "cucumber-js";
};

export const HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR = "HARNESS_CUCUMBER_TAG_EXPRESSION";

export type EnvironmentLike = Record<string, string | undefined>;

export type CucumberJsUserConfiguration = {
  tags?: string;
  [key: string]: unknown;
};

export type CucumberJsRunConfiguration = {
  sources: {
    tagExpression?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CucumberJsMessageHandler = Parameters<typeof runCucumber>[2];

export type RunCucumberWithHarnessEnvOptions = {
  env?: EnvironmentLike;
  environment?: IRunEnvironment;
  onMessage?: CucumberJsMessageHandler;
  run?: typeof runCucumber;
};

export const bridgeDescriptor = (version = "0.0.0"): BridgeDescriptor => ({
  framework: "cucumber-js",
  name: "harness-cucumber-js",
  version,
});

export const harnessCucumberTagExpressionFromEnv = (
  env: EnvironmentLike = process.env,
): string | undefined => cleanTagExpression(env[HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR]);

export const cucumberJsCliArgsFromHarnessEnv = (env: EnvironmentLike = process.env): string[] => {
  const expression = harnessCucumberTagExpressionFromEnv(env);
  return expression ? ["--tags", expression] : [];
};

export const cucumberJsUserConfigurationFromHarnessEnv = <T extends CucumberJsUserConfiguration>(
  configuration: T,
  env: EnvironmentLike = process.env,
): T => {
  const expression = harnessCucumberTagExpressionFromEnv(env);
  return expression ? { ...configuration, tags: expression } : configuration;
};

export const cucumberJsRunConfigurationFromHarnessEnv = <T extends CucumberJsRunConfiguration>(
  configuration: T,
  env: EnvironmentLike = process.env,
): T => {
  const expression = harnessCucumberTagExpressionFromEnv(env);
  return expression
    ? {
        ...configuration,
        sources: {
          ...configuration.sources,
          tagExpression: expression,
        },
      }
    : configuration;
};

export const runCucumberWithHarnessEnv = (
  configuration: IRunOptions,
  options: RunCucumberWithHarnessEnvOptions = {},
): Promise<IRunResult> => {
  const env = options.env ?? options.environment?.env ?? process.env;
  const runner = options.run ?? runCucumber;
  const expression = harnessCucumberTagExpressionFromEnv(env);
  const runConfiguration = expression
    ? {
        ...configuration,
        sources: {
          ...configuration.sources,
          tagExpression: expression,
        },
      }
    : configuration;

  return runner(runConfiguration, options.environment, options.onMessage);
};

export type CucumberMessageEnvelope = Envelope;

export type CucumberJsBridgeInput = {
  envelopes: Iterable<CucumberMessageEnvelope>;
};

export type CucumberJsBridgeOutput = {
  bridge: BridgeDescriptor;
  results: ExampleResult[];
};

export const convertCucumberMessages = (
  input: CucumberJsBridgeInput,
  version = "0.0.0",
): CucumberJsBridgeOutput => {
  const documents = new Map<string, GherkinDocument>();
  const pickles = new Map<string, Pickle>();
  const testCases = new Map<string, TestCase>();
  const startedCaseIds = new Map<string, string>();
  const finishedSteps = new Map<string, Map<string, TestStepFinished>>();

  for (const envelope of input.envelopes) {
    if (envelope.gherkinDocument?.uri) {
      documents.set(envelope.gherkinDocument.uri, envelope.gherkinDocument);
    }
    if (envelope.pickle) {
      pickles.set(envelope.pickle.id, envelope.pickle);
    }
    if (envelope.testCase) {
      testCases.set(envelope.testCase.id, envelope.testCase);
    }
    if (envelope.testCaseStarted) {
      startedCaseIds.set(envelope.testCaseStarted.id, envelope.testCaseStarted.testCaseId);
    }
    if (envelope.testStepFinished) {
      const steps = finishedSteps.get(envelope.testStepFinished.testCaseStartedId) ?? new Map();
      steps.set(envelope.testStepFinished.testStepId, envelope.testStepFinished);
      finishedSteps.set(envelope.testStepFinished.testCaseStartedId, steps);
    }
  }

  return {
    bridge: bridgeDescriptor(version),
    results: [...startedCaseIds.entries()].flatMap(([startedId, testCaseId]) => {
      const testCase = testCases.get(testCaseId);
      const pickle = testCase ? pickles.get(testCase.pickleId) : undefined;
      if (!testCase || !pickle) {
        return [];
      }
      const identity = cucumberIdentityFromPickle(pickle);
      if (!identity) {
        return [];
      }
      const stepsByAstId = stepsByAstNodeId(documents.get(pickle.uri));
      const finishedByStep = finishedSteps.get(startedId) ?? new Map();
      const steps = testCase.testSteps
        .filter((testStep) => testStep.pickleStepId)
        .map((testStep) => {
          const pickleStep = pickle.steps.find((step) => step.id === testStep.pickleStepId);
          const gherkinStep = pickleStep
            ? stepsByAstId.get(pickleStep.astNodeIds[0] ?? "")
            : undefined;
          const finished = finishedByStep.get(testStep.id);
          return {
            failureMessage: finished?.testStepResult.message,
            keyword: stepKeyword(gherkinStep, pickleStep),
            status: exampleStatusFromCucumber(finished?.testStepResult.status),
            text: pickleStep?.text ?? gherkinStep?.text ?? "",
          };
        });
      const failureMessage = steps.find((step) => step.failureMessage)?.failureMessage;

      return [
        {
          ...identity,
          failureMessage,
          file: pickle.uri,
          labels: {
            runner: "cucumber-js",
          },
          line: pickle.location?.line,
          name: pickle.name,
          status: exampleStatusFromSteps(steps.map((step) => step.status)),
          steps,
        },
      ];
    }),
  };
};

const cleanTagExpression = (value: string | undefined): string | undefined => {
  const expression = value?.trim();
  return expression ? expression : undefined;
};

const cucumberIdentityFromPickle = (
  pickle: Pickle,
): Pick<ExampleResult, "example" | "feature" | "locale" | "rule"> | undefined => {
  const tags = pickle.tags.map((tag) => tag.name);
  const feature = tags.find((tag) => tag.startsWith("@feature:"));
  const rule = tags.find((tag) => tag.startsWith("@rule:"));
  const example = tags.find((tag) => tag.startsWith("@example:"));
  const locale = tags.find((tag) => tag.startsWith("@locale:"))?.slice("@locale:".length);
  return feature && rule && example && locale
    ? {
        example,
        feature,
        locale,
        rule,
      }
    : undefined;
};

const stepsByAstNodeId = (document: GherkinDocument | undefined): Map<string, Step> => {
  const steps = new Map<string, Step>();
  for (const child of document?.feature?.children ?? []) {
    for (const step of child.background?.steps ?? []) {
      steps.set(step.id, step);
    }
    for (const step of child.scenario?.steps ?? []) {
      steps.set(step.id, step);
    }
    for (const ruleChild of child.rule?.children ?? []) {
      for (const step of ruleChild.background?.steps ?? []) {
        steps.set(step.id, step);
      }
      for (const step of ruleChild.scenario?.steps ?? []) {
        steps.set(step.id, step);
      }
    }
  }
  return steps;
};

const stepKeyword = (
  step: Step | undefined,
  pickleStep: PickleStep | undefined,
): StepResult["keyword"] => {
  const keyword = step?.keyword.trim();
  if (isStepKeyword(keyword)) {
    return keyword;
  }
  if (pickleStep?.type === PickleStepType.ACTION) {
    return "When";
  }
  if (pickleStep?.type === PickleStepType.OUTCOME) {
    return "Then";
  }
  return "Given";
};

const isStepKeyword = (keyword: string | undefined): keyword is StepResult["keyword"] =>
  keyword === "Given" ||
  keyword === "When" ||
  keyword === "Then" ||
  keyword === "And" ||
  keyword === "But";

const exampleStatusFromCucumber = (status: TestStepResultStatus | undefined): ExampleStatus => {
  if (status === TestStepResultStatus.PASSED) {
    return "passing";
  }
  if (status === TestStepResultStatus.SKIPPED) {
    return "skipped";
  }
  return "failing";
};

const exampleStatusFromSteps = (statuses: ExampleStatus[]): ExampleStatus => {
  if (statuses.some((status) => status === "failing")) {
    return "failing";
  }
  if (statuses.some((status) => status === "skipped")) {
    return "skipped";
  }
  return "passing";
};
