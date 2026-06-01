# Why Test Harness

> Status: Short background note
> Goal: Capture why this project exists and make the voice-message example concrete.

## Background

The current workflow often starts with a human describing a feature, then an implementer or Agent begins coding from the visible product behavior and their personal understanding of similar apps. A document may be written first, but long documents are hard to review carefully.

For larger features, code review also becomes unreliable. A feature can touch thousands of lines, while the human still has to read code, try the product, and judge whether the experience matches the original intent.

Test Harness should move review earlier and higher. Before implementation, a feature should be discussed as a small set of reviewable behavior rules and examples. After review, executable tests prove that the implementation still satisfies those behaviors.

The point is not just to run more tests. The point is to let humans review the behavior model, while the Harness maps test evidence back to the feature behavior.

## Terms

- [BDD](https://cucumber.io/docs/bdd/) is a development practice that describes expected behavior in examples humans and implementation teams can review together.
- [Cucumber](https://cucumber.io/docs/guides/overview/) is a tool family for running executable behavior specifications written in plain-language examples.
- [Gherkin](https://cucumber.io/docs/gherkin/reference/) is the structured language Cucumber uses to write `Feature`, `Rule`, `Example`, `Given`, `When`, and `Then` behavior files.

## Organization Model

For a large product like WeChat, code may be split across frontend, backend, mobile, and infrastructure packages. Test Harness can keep Cucumber's native structure below `Feature`, while adding a lightweight organization layer above it:

```text
Package
  Module
    Feature
      Rule
        Example
```

`Feature`, `Rule`, and `Example` come from the BDD/Cucumber model. `Package` and `Module` are defined by Test Harness manifests, with tags connecting the manifest world to `.feature` files.

```yaml
# harness.packages.yaml
apiVersion: 1
packages:
  - id: mobile-client
    title:
      en: WeChat mobile client
      zh-CN: 微信移动客户端
    modules:
      - chat-composer
      - message-timeline

  - id: messaging-server
    title:
      en: Messaging server
      zh-CN: 消息服务后端
    modules:
      - message-delivery
      - media-transfer
```

```yaml
# harness.modules.yaml
apiVersion: 1
modules:
  - id: chat-composer
    title:
      en: Chat composer
      zh-CN: 聊天输入区
    package: mobile-client
    features:
      - tag: "@feature:voice-message.send"
        title:
          en: Send voice message
          zh-CN: 发送语音条

  - id: media-transfer
    title:
      en: Media transfer
      zh-CN: 媒体传输
    package: messaging-server
    features:
      - tag: "@feature:voice-message.chunk-upload"
        title:
          en: Upload voice chunks
          zh-CN: 语音分片上传
      - tag: "@feature:voice-message.chunk-merge"
        title:
          en: Merge voice chunks
          zh-CN: 语音分片合并
```

Harness-owned YAML files also support multiple languages, but they do not need one file per locale. Natural-language fields use `LocalizedText`: either a plain string treated as default English, or a language map such as `{ en, zh-CN }`. Stable machine fields such as `id`, `tag`, `package`, `module`, `state`, and result identifiers are never localized.

Then a Cucumber feature file can carry the same identity through tags:

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
@locale:en
Feature: Send voice message
```

## Multilingual Feature Files

The Harness frontend should eventually let reviewers switch language while reading the same behavior model. For that to work, each reviewed language gets its own `.feature` file, but stable tags stay identical.

```text
features/mobile-client/chat-composer/voice-message.send.en.feature
features/mobile-client/chat-composer/voice-message.send.zh-CN.feature
```

English:

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
@locale:en
Feature: Send voice message

  @rule:voice-message.progressive-upload
  Rule: Recording transfers audio chunks before release

    @example:chunks-upload-before-release
    Example: Chunks start uploading while the sender is still recording
      Given Alice is recording a voice message to Bob
      When Alice has recorded for more than one second
      Then at least one audio chunk has uploaded or is uploading
```

Chinese:

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
@locale:zh-CN
Feature: 发送语音条

  @rule:voice-message.progressive-upload
  Rule: 录音过程中提前传输语音分片

    @example:chunks-upload-before-release
    Example: 用户仍在录音时，分片已经开始上传
      Given Alice 正在给 Bob 录制语音消息
      When Alice 已经录制超过 1 秒
      Then 至少一个语音分片已经上传成功或正在上传
```

The natural-language title and step body text can be translated. Gherkin structural keywords stay English in every locale. The behavior identity must not be translated:

- `@package`, `@module`, `@feature`, `@rule`, and `@example` are stable machine identity.
- `@locale:<code>` tells Harness which localized description file is being read.
- `Feature`, `Rule`, `Example`, `Given`, `When`, `Then`, `And`, and `But` remain English even in localized files.
- Harness YAML text fields use `LocalizedText` maps, while YAML ids, tags, Rule state values, and evidence identifiers remain language-neutral.
- Example result identity is `featureTag + ruleTag + exampleTag`; file path, line number, and locale are metadata.
- Locale configuration lives in a Harness-owned file such as `tests/harness.locales.yaml`, with `sourceLocale`, `requiredLocales`, and `executionLocale`.
- `harness check` should verify that all required locales have the same Feature, Rule, Example, and step-shape structure.

## Binding To Test Code

Cucumber does not require a one-to-one link between a `.feature` file and a unit test file. Instead, it loads feature files and configured step definition files, then matches each `Given`, `When`, and `Then` line to executable code.

```gherkin
Feature: Send voice message

  Example: Release finalizes the recording
    Given Alice is recording a voice message
    When Alice releases the recording button
    Then the client sends a voice_recording_finalized event
```

```ts
import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";

Given("Alice is recording a voice message", async function () {
  this.session = await startVoiceRecording();
});

When("Alice releases the recording button", async function () {
  this.event = await releaseRecording(this.session);
});

Then("the client sends a voice_recording_finalized event", function () {
  assert.equal(this.event.type, "voice_recording_finalized");
});
```

If a step has no matching definition, the example is undefined. If a step definition throws or an assertion fails, the example fails. If all matched steps complete successfully, the example passes.

For Harness-owned behavior, the executable proof should start from the matching Cucumber Example. Other tools can be used inside step definitions, but they should not become a separate test layer that proves Harness behavior without a `.feature` file.

## Human Rule State

Rule state is human governance, not test status. A rule can be `accepted` and currently failing, or `draft` and already passing. The `.feature` file describes behavior; Test Harness stores Rule state and review history in protocol files.

```yaml
# harness.behavior.yaml
apiVersion: 1
rules:
  - feature: "@feature:voice-message.send"
    rule: "@rule:voice-message.progressive-upload"
    state: accepted
    review:
      by: xinyao
      at: "2026-05-30"
      note: "Accepted progressive chunk transfer as a key part of instant voice-message sending."
    owner: chat-composer
```

```yaml
# harness.review-log.yaml
apiVersion: 1
events:
  - at: "2026-05-30T10:30:00Z"
    actor: xinyao
    action: accepted
    target: "@rule:voice-message.progressive-upload"
    ref: "pr-42"
    note: "Approved progressive chunk transfer as a key part of instant voice-message sending."
```

## Agent Authoring Skill

The loop also needs a Harness-aware Agent skill. Its job is to teach Agents how to create and change Harness files without breaking the behavior model.

When a new request arrives, the Agent should first update behavior artifacts and wait for human acceptance, then implementation:

```text
user request
  -> choose or create package/module
  -> draft Feature / Rule / Example
  -> update manifests and stable tags
  -> write Rule state and review-log entries
  -> human reviews and accepts the touched .feature behavior
  -> write step definitions with real assertions
  -> implement code
  -> run Cucumber and report behavior coverage
```

The skill should enforce a few rules:

- Agents can create `draft` or `proposed` rules.
- Agents can mark rules `accepted` only when the human explicitly accepts them.
- Agents must not write step definitions, executable tests, or implementation logic for a `.feature` until every touched Rule in that `.feature` is `accepted`, or explicitly accepted in the current review surface.
- Accepted rules cannot be weakened, moved, deprecated, or deleted without a review-log event.
- Every Feature, Rule, and Example needs a stable tag such as `@feature:voice-message.send`, `@rule:voice-message.progressive-upload`, or `@example:chunks-upload-before-release`.
- Localized `.feature` files reuse the same stable tags and differ only by `@locale` and human-readable names or step body text.
- Gherkin structural keywords remain English across locales so parsing and review shape do not depend on dialect switching.
- Harness-owned YAML manifests store translatable labels as `LocalizedText`, not as duplicated per-locale manifest files.
- Every `Then` step should observe real system behavior, not pass with placeholder assertions.
- Final output should summarize behavior changes, Rule state, run status, undefined steps, and items needing human review.

## Closure Pieces

These capabilities turn a collection of BDD files into a Test Harness:

1. Manifest and tag consistency checks between packages, modules, features, and `.feature` files.
2. Stable Rule identity through tags such as `@rule:voice-message.progressive-upload`.
3. Result aggregation from Cucumber examples up to Rule, Feature, Module, and Package.
4. Rule state and review-log protection for accepted behavior changes.
5. Behavior coverage reports: declared features, described rules, automated examples, executed examples, and passing behavior.
6. Locale parity checks so English and Chinese descriptions stay equivalent instead of drifting into different behavior.
7. Localized YAML metadata for packages, modules, features, and human-facing review notes.

## Example: Sending A Voice Message

A weak implementation might record audio locally, wait until the user releases the button, upload the full audio file, then make the recipient wait to download it before playback. It technically "sends a voice message", but it misses the expected instant-send experience.

The intended behavior is closer to this:

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
@locale:en
Feature: Send voice message

  @rule:voice-message.progressive-upload
  Rule: Recording transfers audio chunks before release

    @example:chunks-upload-before-release
    Example: Chunks start uploading while the sender is still recording
      Given Alice is recording a voice message to Bob
      When Alice has recorded for more than one second
      Then at least one audio chunk has uploaded or is uploading
      But the client has not uploaded a full audio file

  @rule:voice-message.release-finalizes-state
  Rule: Releasing the button only finalizes message state

    @example:release-sends-finalized-event
    Example: Release sends a finalized event instead of a full upload
      Given Alice is recording a voice message
      And audio chunks have already started transferring
      When Alice releases the recording button
      Then the client sends a voice_recording_finalized event
      And the recipient can show the voice message from the transferred chunks
      But the sender does not wait for a full post-release upload
```

This is the kind of behavior model Test Harness should make easy to review, execute, and preserve over time.
