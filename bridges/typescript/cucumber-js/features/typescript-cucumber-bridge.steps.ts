import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { After, Given, Then, When } from "@cucumber/cucumber";
import { loadConfiguration, type IRunOptions } from "@cucumber/cucumber/api";

import {
  HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR,
  convertCucumberMessages,
  cucumberJsCliArgsFromHarnessEnv,
  cucumberJsRunConfigurationFromHarnessEnv,
  cucumberJsUserConfigurationFromHarnessEnv,
  harnessCucumberTagExpressionFromEnv,
  type CucumberJsBridgeOutput,
  type CucumberMessageEnvelope,
  type CucumberJsRunConfiguration,
  runCucumberWithHarnessEnv,
} from "../src/index.ts";

type BridgeWorld = {
  converted?: CucumberJsBridgeOutput;
  expression?: string;
  executableRunConfiguration?: IRunOptions;
  messages?: CucumberMessageEnvelope[];
  output?: MemoryWritable;
  preparedRunConfiguration?: CucumberJsRunConfiguration;
  runSucceeded?: boolean;
  tempDirs?: string[];
  userConfiguration?: Record<string, unknown>;
};

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

Given("Cucumber.js emits Messages for a tagged Example run", async function (this: BridgeWorld) {
  this.messages = await runNestedCucumber({
    exampleTag: "@example:cucumber-js-messages-become-harness-result",
    featureBody: `@feature:harness.results.typescript-cucumber-bridge
@locale:en
Feature: Nested Cucumber.js Messages

  @rule:harness.results.cucumber-js-records-example-results
  Rule: TypeScript bridge records Cucumber.js Example results

    @example:cucumber-js-messages-become-harness-result
    Example: Tagged Example
      Given the nested Cucumber.js message Example runs
`,
    stepBody: `import { Given } from "@cucumber/cucumber";

Given("the nested Cucumber.js message Example runs", function () {});
`,
    world: this,
  });
});

When("the TypeScript bridge converts those Messages", function (this: BridgeWorld) {
  this.converted = convertCucumberMessages({ envelopes: this.messages ?? [] });
});

Then(
  "it returns a Harness result identified by feature, rule, example, and locale tags",
  function (this: BridgeWorld) {
    assert.deepEqual(this.converted?.bridge, {
      framework: "cucumber-js",
      name: "harness-cucumber-js",
      version: "0.0.0",
    });
    assert.equal(this.converted?.results.length, 1);
    const result = this.converted?.results[0];
    assert.equal(result?.example, "@example:cucumber-js-messages-become-harness-result");
    assert.equal(result?.feature, "@feature:harness.results.typescript-cucumber-bridge");
    assert.equal(result?.labels?.runner, "cucumber-js");
    assert.equal(result?.line, 9);
    assert.equal(result?.locale, "en");
    assert.equal(result?.name, "Tagged Example");
    assert.equal(result?.rule, "@rule:harness.results.cucumber-js-records-example-results");
    assert.equal(result?.status, "passing");
    assert.deepEqual(result?.steps, [
      {
        failureMessage: undefined,
        keyword: "Given",
        status: "passing",
        text: "the nested Cucumber.js message Example runs",
      },
    ]);
  },
);

Given(
  "HARNESS_CUCUMBER_TAG_EXPRESSION contains a Cucumber tag expression",
  function (this: BridgeWorld) {
    this.expression = "@rule:harness.results.cucumber-js-uses-harness-filter and @locale:zh-CN";
  },
);

When("the TypeScript bridge prepares Cucumber.js execution", function (this: BridgeWorld) {
  const env = {
    [HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR]: ` ${this.expression} `,
  };
  this.userConfiguration = cucumberJsUserConfigurationFromHarnessEnv({ strict: true }, env);
  this.preparedRunConfiguration = cucumberJsRunConfigurationFromHarnessEnv(
    {
      sources: {
        name: [],
        order: "defined",
        paths: ["features/**/*.feature"],
      },
    },
    env,
  );
  assert.equal(harnessCucumberTagExpressionFromEnv(env), this.expression);
  assert.deepEqual(cucumberJsCliArgsFromHarnessEnv(env), ["--tags", this.expression]);
});

Then(
  "it writes that expression to Cucumber.js user tags and run tagExpression configuration",
  function (this: BridgeWorld) {
    assert.equal(this.userConfiguration?.tags, this.expression);
    assert.equal(this.preparedRunConfiguration?.sources.tagExpression, this.expression);
  },
);

Given(
  "a Cucumber.js executable entrypoint has selected and unselected Examples",
  async function (this: BridgeWorld) {
    const tempDir = await createTempDir(this, "filter");
    const featurePath = join(tempDir, "filter.feature");
    const supportPath = join(tempDir, "steps.mjs");
    await writeFile(
      featurePath,
      `@feature:harness.results.typescript-cucumber-bridge
@locale:en
Feature: Native Cucumber.js filtering

  @rule:harness.results.cucumber-js-uses-harness-filter
  Rule: TypeScript bridge maps Harness filters to Cucumber.js filters

    @selected
    @example:harness-filter-is-applied-by-cucumber-js-entrypoint
    Example: Selected Example
      Given the selected Cucumber.js Example runs

    @other
    @example:unselected-cucumber-js-example
    Example: Unselected Example
      Given the unselected Cucumber.js Example would fail
`,
    );
    await writeFile(
      supportPath,
      `import { Given } from "@cucumber/cucumber";

Given("the selected Cucumber.js Example runs", function () {});
Given("the unselected Cucumber.js Example would fail", function () {
  throw new Error("the Harness tag expression did not reach Cucumber.js");
});
`,
    );

    const { runConfiguration } = await loadConfiguration({
      file: false,
      provided: {
        format: ["progress"],
        import: [supportPath],
        paths: [featurePath],
        publish: false,
      },
    });
    this.executableRunConfiguration = runConfiguration;
  },
);

When(
  "the TypeScript bridge calls runCucumber with HARNESS_CUCUMBER_TAG_EXPRESSION",
  async function (this: BridgeWorld) {
    assert.ok(this.executableRunConfiguration, "run configuration should exist");
    const output = new MemoryWritable();
    const messages: CucumberMessageEnvelope[] = [];
    const result = await runCucumberWithHarnessEnv(this.executableRunConfiguration, {
      env: {
        [HARNESS_CUCUMBER_TAG_EXPRESSION_ENV_VAR]: "@selected",
      },
      environment: {
        cwd: packageDir,
        stderr: output,
        stdout: output,
      },
      onMessage: (message) => messages.push(message),
    });
    this.converted = convertCucumberMessages({ envelopes: messages });
    this.output = output;
    this.runSucceeded = result.success;
  },
);

Then(
  "Cucumber.js runs only the Examples matching sources.tagExpression",
  function (this: BridgeWorld) {
    assert.equal(this.runSucceeded, true);
    assert.ok(!this.output?.text.includes("Harness tag expression did not reach Cucumber.js"));
    assert.equal(this.converted?.results.length, 1);
    assert.equal(
      this.converted?.results[0]?.example,
      "@example:harness-filter-is-applied-by-cucumber-js-entrypoint",
    );
    assert.equal(this.converted?.results[0]?.status, "passing");
  },
);

async function runNestedCucumber({
  exampleTag,
  featureBody,
  stepBody,
  world,
}: {
  exampleTag: string;
  featureBody: string;
  stepBody: string;
  world: BridgeWorld;
}): Promise<CucumberMessageEnvelope[]> {
  const tempDir = await createTempDir(world, exampleTag.replace(/[^a-z0-9]+/gi, "-"));
  const featurePath = join(tempDir, "messages.feature");
  const supportPath = join(tempDir, "steps.mjs");
  await writeFile(featurePath, featureBody);
  await writeFile(supportPath, stepBody);
  const { runConfiguration } = await loadConfiguration({
    file: false,
    provided: {
      format: ["progress"],
      import: [supportPath],
      paths: [featurePath],
      publish: false,
    },
  });
  const output = new MemoryWritable();
  const messages: CucumberMessageEnvelope[] = [];
  const result = await runCucumberWithHarnessEnv(runConfiguration, {
    env: {},
    environment: {
      cwd: packageDir,
      stderr: output,
      stdout: output,
    },
    onMessage: (message) => messages.push(message),
  });
  assert.equal(result.success, true);
  return messages;
}

async function createTempDir(world: BridgeWorld, name: string): Promise<string> {
  const tempDir = join(packageDir, `.tmp-cucumber-js-${name}`);
  await rm(tempDir, { force: true, recursive: true });
  await mkdir(tempDir, { recursive: true });
  world.tempDirs = [...(world.tempDirs ?? []), tempDir];
  return tempDir;
}

class MemoryWritable extends Writable {
  text = "";

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.text += chunk.toString();
    callback();
  }
}

After(async function (this: BridgeWorld) {
  await Promise.all(
    (this.tempDirs ?? []).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});
