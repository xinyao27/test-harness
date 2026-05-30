# Why Test Harness

> Status: Short background note
> Goal: Capture why this project exists and make the voice-message example concrete.

## Background

The current workflow often starts with a human describing a feature, then an implementer or Agent begins coding from the visible product behavior and their personal understanding of similar apps. A document may be written first, but long documents are hard to review carefully.

For larger features, code review also becomes unreliable. A feature can touch thousands of lines, while the human still has to read code, try the product, and judge whether the experience matches the original intent.

Test Harness should move review earlier and higher. Before implementation, a feature should be discussed as a small set of reviewable behavior rules and examples. After review, executable tests prove that the implementation still satisfies those behaviors.

The point is not just to run more tests. The point is to let humans review the behavior model, while the Harness maps test evidence back to the feature behavior.

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
    title: WeChat mobile client
    modules:
      - chat-composer
      - message-timeline

  - id: messaging-server
    title: Messaging server
    modules:
      - message-delivery
      - media-transfer
```

```yaml
# harness.modules.yaml
apiVersion: 1
modules:
  - id: chat-composer
    title: Chat composer
    package: mobile-client
    features:
      - tag: "@feature:voice-message.send"
        title: Send voice message

  - id: media-transfer
    title: Media transfer
    package: messaging-server
    features:
      - tag: "@feature:voice-message.chunk-upload"
        title: Upload voice chunks
      - tag: "@feature:voice-message.chunk-merge"
        title: Merge voice chunks
```

Then a Cucumber feature file can carry the same identity through tags:

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
Feature: Send voice message
```

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
import { expect } from "vitest";

Given("Alice is recording a voice message", async function () {
  this.session = await startVoiceRecording();
});

When("Alice releases the recording button", async function () {
  this.event = await releaseRecording(this.session);
});

Then("the client sends a voice_recording_finalized event", function () {
  expect(this.event.type).toBe("voice_recording_finalized");
});
```

If a step has no matching definition, the example is undefined. If a step definition throws or an assertion fails, the example fails. If all matched steps complete successfully, the example passes.

## Human Lifecycle

Lifecycle is human governance, not test status. A rule can be `accepted` and currently failing, or `draft` and already passing. The `.feature` file describes behavior; Test Harness stores review state and history in protocol files.

```yaml
# harness.behavior.yaml
apiVersion: 1
rules:
  - tag: "@rule:voice-message.progressive-upload"
    feature: "@feature:voice-message.send"
    lifecycle: accepted
    priority: high
    reviewed:
      state: approved
      by: xinyao
      at: "2026-05-30"
      ref: "pr-42"
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

When a new request arrives, the Agent should first update behavior artifacts, then implementation:

```text
user request
  -> choose or create package/module
  -> draft Feature / Rule / Example
  -> update manifests and stable tags
  -> write lifecycle and review-log entries
  -> write step definitions with real assertions
  -> implement code
  -> run Cucumber and report behavior coverage
```

The skill should enforce a few rules:

- Agents can create `draft` or `proposed` rules.
- Agents can mark rules `accepted` only when the human explicitly approves them.
- Accepted rules cannot be weakened, moved, deprecated, or deleted without a review-log event.
- Every Feature and Rule needs a stable tag such as `@feature:voice-message.send` or `@rule:voice-message.progressive-upload`.
- Every `Then` step should observe real system behavior, not pass with placeholder assertions.
- Final output should summarize behavior changes, lifecycle state, run status, undefined steps, and items needing human review.

## Closure Pieces

These five capabilities turn a collection of BDD files into a Test Harness:

1. Manifest and tag consistency checks between packages, modules, features, and `.feature` files.
2. Stable Rule identity through tags such as `@rule:voice-message.progressive-upload`.
3. Result aggregation from Cucumber examples up to Rule, Feature, Module, and Package.
4. Lifecycle and review-log protection for accepted behavior changes.
5. Behavior coverage reports: declared features, described rules, automated examples, executed examples, and passing behavior.

## Example: Sending A Voice Message

A weak implementation might record audio locally, wait until the user releases the button, upload the full audio file, then make the recipient wait to download it before playback. It technically "sends a voice message", but it misses the expected instant-send experience.

The intended behavior is closer to this:

```gherkin
Feature: Send voice message

  Rule: Recording transfers audio chunks before release

    Example: Chunks start uploading while the sender is still recording
      Given Alice is recording a voice message to Bob
      When Alice has recorded for more than one second
      Then at least one audio chunk has uploaded or is uploading
      But the client has not uploaded a full audio file

  Rule: Releasing the button only finalizes message state

    Example: Release sends a finalized event instead of a full upload
      Given Alice is recording a voice message
      And audio chunks have already started transferring
      When Alice releases the recording button
      Then the client sends a voice_recording_finalized event
      And the recipient can show the voice message from the transferred chunks
      But the sender does not wait for a full post-release upload
```

This is the kind of behavior model Test Harness should make easy to review, execute, and preserve over time.
