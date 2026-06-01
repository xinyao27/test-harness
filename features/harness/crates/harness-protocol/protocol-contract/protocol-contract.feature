@package:harness-protocol
@module:protocol-contract
@feature:harness.protocol.v1-artifact-contracts
@locale:en
Feature: Protocol v1 artifact contracts

  @rule:harness.protocol.api-version-one
  Rule: Harness-owned artifacts pin apiVersion 1

    @example:non-v1-artifact-is-rejected
    Example: A non-v1 artifact is rejected by the protocol model
      Given a Harness-owned YAML artifact is decoded through the protocol crate
      When the artifact uses an apiVersion other than 1
      Then the protocol model rejects it instead of accepting a silent shape change

  @rule:harness.protocol.localized-text-shape
  Rule: Human-facing protocol text supports plain or localized values

    @example:localized-text-accepts-string-or-locale-map
    Example: Localized text can be a string or language map
      Given package, module, review, or review-log text is decoded
      When the value is either a plain string or a locale-keyed text map
      Then the protocol model preserves it as LocalizedText

  @rule:harness.protocol.strict-artifact-fields
  Rule: Protocol artifacts reject unknown fields

    @example:unknown-fields-fail-decode
    Example: Unknown fields do not silently enter Harness artifacts
      Given a package, module, behavior, review-log, config, bridge event, or result artifact contains an extra field
      When the protocol crate decodes that artifact
      Then decoding fails instead of preserving the unknown field

  @rule:harness.protocol.cucumber-result-identity
  Rule: Cucumber results are keyed by behavior tags

    @example:result-requires-feature-rule-example-tags
    Example: A result requires stable Cucumber behavior identity
      Given a bridge emits an Example result
      When the result is decoded through the protocol crate
      Then it requires feature, rule, example, locale, status, file, name, and step data
