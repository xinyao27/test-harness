# 为什么要做 Test Harness

> 状态：简短背景说明
> 目标：记录这个项目为什么存在，并用“发送语音条”的例子讲清楚。

## 背景

现在的工作流通常是：人提出一个功能需求，接需求的人或 Agent 根据产品表象、个人理解和类似产品经验开始实现。实现前也许会写文档，但很长的文档很难被认真 review。

功能稍微变大之后，代码 review 也会变得不可靠。一个功能可能改动几千行甚至更多代码，而人仍然要读代码、实际体验产品，再判断它是否符合最初的意图。

Test Harness 想把 review 前置，并提升到更高层。实现前，先把一个 feature 讨论成少量可 review 的行为规则和例子；review 通过后，再用可执行测试证明实现仍然满足这些行为。

重点不是“多跑一些测试”。重点是让人 review 行为模型，让 Harness 把测试证据映射回 feature 行为。

## 术语

- [BDD](https://cucumber.io/docs/bdd/) 是一种用人和实现团队都能共同 review 的例子来描述预期行为的开发方式。
- [Cucumber](https://cucumber.io/docs/guides/overview/) 是一组用于运行 plain-language 行为规格的工具。
- [Gherkin](https://cucumber.io/docs/gherkin/reference/) 是 Cucumber 用来编写 `Feature`、`Rule`、`Example`、`Given`、`When`、`Then` 行为文件的结构化语言。

## 组织模型

以微信这样的大型产品为例，代码可能拆在前端、后端、移动端和基础设施等不同 package 里。Test Harness 可以保留 Cucumber 在 `Feature` 以下的原生结构，同时在 `Feature` 之上补充一层轻量组织结构：

```text
Package
  Module
    Feature
      Rule
        Example
```

`Feature`、`Rule`、`Example` 来自 BDD/Cucumber 模型。`Package` 和 `Module` 由 Test Harness manifest 定义，再通过 tags 和 `.feature` 文件连接。

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

Harness 自己定义的 YAML 文件也支持多语言，但不需要每种语言复制一个文件。自然语言字段使用 `LocalizedText`：可以是一个普通字符串，代表默认英文；也可以是 `{ en, zh-CN }` 这样的语言 map。`id`、`tag`、`package`、`module`、`state` 和 result identifiers 这类稳定机器字段永不本地化。

然后 Cucumber feature 文件可以通过同一组 tags 挂上身份：

```gherkin
@package:mobile-client
@module:chat-composer
@feature:voice-message.send
@locale:zh-CN
Feature: 发送语音条
```

## 多语言 Feature 文件

未来 Harness 前端应该允许 reviewer 在阅读同一个行为模型时切换语言。为了做到这一点，每一种被 review 的语言都有自己的 `.feature` 文件，但稳定 tags 必须保持一致。

```text
features/mobile-client/chat-composer/voice-message.send.en.feature
features/mobile-client/chat-composer/voice-message.send.zh-CN.feature
```

英文：

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

中文：

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

自然语言标题和 step body text 可以翻译。Gherkin 结构关键词在所有 locale 里都保持英文。行为身份不能翻译：

- `@package`、`@module`、`@feature`、`@rule`、`@example` 是稳定机器身份。
- `@locale:<code>` 告诉 Harness 当前读取的是哪种语言的描述文件。
- `Feature`、`Rule`、`Example`、`Given`、`When`、`Then`、`And` 和 `But` 即使在多语言文件里也保持英文。
- Harness YAML 的文本字段使用 `LocalizedText` map，但 YAML ids、tags、Rule state values 和 evidence identifiers 保持语言中立。
- Example result identity 是 `featureTag + ruleTag + exampleTag`；文件路径、行号和 locale 只是 metadata。
- 语言配置放在 Harness 自己的文件里，例如 `tests/harness.locales.yaml`，包含 `sourceLocale`、`requiredLocales` 和 `executionLocale`。
- `harness check` 应该校验所有 required locales 都有相同的 Feature、Rule、Example 和 step-shape 结构。

## 绑定到测试代码

Cucumber 不要求一个 `.feature` 文件和某个单元测试文件一一对应。它会加载 feature 文件和配置好的 step definition 文件，然后把每一行 `Given`、`When`、`Then` 匹配到可执行代码。

```gherkin
Feature: 发送语音条

  Example: 松开按钮确认录音完成
    Given Alice 正在录制语音消息
    When Alice 松开录音按钮
    Then 客户端发送 voice_recording_finalized 事件
```

```ts
import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";

Given("Alice 正在录制语音消息", async function () {
  this.session = await startVoiceRecording();
});

When("Alice 松开录音按钮", async function () {
  this.event = await releaseRecording(this.session);
});

Then("客户端发送 voice_recording_finalized 事件", function () {
  assert.equal(this.event.type, "voice_recording_finalized");
});
```

如果某个 step 找不到匹配的 definition，这个 example 会变成 undefined。如果 step definition 抛错或断言失败，这个 example 失败。如果所有匹配到的 steps 都成功执行，这个 example 通过。

对 Harness 自己拥有的行为来说，executable proof 应该从对应的 Cucumber Example 开始。其他工具可以在 step definitions 里面使用，但不应该变成没有 `.feature` 文件也能证明 Harness 行为的另一层测试。

## 人类 Rule State

Rule state 是人类治理状态，不是测试运行状态。一个 rule 可以是 `accepted` 但当前 failing，也可以是 `draft` 但已经 passing。`.feature` 文件描述行为；Test Harness 用协议文件保存 Rule state 和 review 历史。

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
      note: "认可录音过程中提前传输分片是语音条秒发体验的关键行为。"
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
    note: "认可录音过程中提前传输分片是语音条秒发体验的关键行为。"
```

## Agent 编写 Skill

这套闭环还需要一个理解 Harness 的 Agent skill。它的作用是告诉 Agent 如何创建和修改 Harness 文件，同时不破坏行为模型。

当一个新需求进入时，Agent 应该先更新行为 artifacts，并等待人类 acceptance，然后再写实现：

```text
用户需求
  -> 选择或创建 package/module
  -> 草拟 Feature / Rule / Example
  -> 更新 manifests 和稳定 tags
  -> 写入 Rule state 和 review-log 记录
  -> 人类 review 并 accept 被触及的 .feature 行为
  -> 编写带真实断言的 step definitions
  -> 实现代码
  -> 运行 Cucumber 并报告 behavior coverage
```

这个 skill 应该强制几条规则：

- Agent 可以创建 `draft` 或 `proposed` rules。
- 只有在人类明确 accept 时，Agent 才能把 rule 标记为 `accepted`。
- 在一个 `.feature` 中所有被触及的 Rule 都变成 `accepted`，或在当前 review surface 明确获得 acceptance 之前，Agent 不能为它写 step definitions、可执行测试或实现逻辑。
- 已 accepted 的 rule 不能在没有 review-log 事件的情况下被弱化、移动、废弃或删除。
- 每个 Feature、Rule 和 Example 都需要稳定 tag，例如 `@feature:voice-message.send`、`@rule:voice-message.progressive-upload` 或 `@example:chunks-upload-before-release`。
- 多语言 `.feature` 文件复用同一组稳定 tags，只允许 `@locale` 和人类可读名称或 step body text 不同。
- Gherkin 结构关键词跨 locale 保持英文，这样 parser 和 review shape 不依赖 dialect 切换。
- Harness 自己的 YAML manifests 用 `LocalizedText` 保存可翻译标签，不复制多份按语言拆开的 manifest 文件。
- 每个 `Then` step 都应该观察真实系统行为，不能用占位断言假通过。
- 最终输出应该总结行为变化、Rule state、运行状态、undefined steps，以及需要人类 review 的事项。

## 闭环能力

这些能力会把一组 BDD 文件变成真正的 Test Harness：

1. 检查 packages、modules、features 和 `.feature` 文件之间的 manifest/tag 一致性。
2. 通过 `@rule:voice-message.progressive-upload` 这类 tag 给 Rule 稳定身份。
3. 把 Cucumber examples 的结果汇总到 Rule、Feature、Module 和 Package。
4. 用 Rule state 和 review-log 保护已 accepted 的行为变更。
5. 输出 behavior coverage：已声明 features、已描述 rules、已自动化 examples、已执行 examples，以及当前通过的行为。
6. 校验语言版本一致性，确保英文和中文描述不会漂移成两个不同的行为。
7. 为 packages、modules、features 和面向人的 review notes 提供多语言 YAML metadata。

## 例子：发送语音条

一个弱实现可能是：本地录音，等用户松开按钮后再上传完整音频，然后接收方等待下载完成后才能播放。它表面上也叫“发送语音消息”，但没有达到预期的秒发体验。

更接近目标的行为应该是：

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
      But 客户端没有上传完整音频文件

  @rule:voice-message.release-finalizes-state
  Rule: 松开录音按钮只确认消息完成状态

    @example:release-sends-finalized-event
    Example: 松开按钮发送完成事件，而不是完整上传
      Given Alice 正在录制语音消息
      And 语音分片已经开始传输
      When Alice 松开录音按钮
      Then 客户端发送 voice_recording_finalized 事件
      And 接收方可以基于已传输分片展示语音消息
      But 发送方不需要等待松开后的完整音频上传
```

Test Harness 应该让这种行为模型变得容易 review、容易执行，并且能在后续演进中被持续保留下来。
