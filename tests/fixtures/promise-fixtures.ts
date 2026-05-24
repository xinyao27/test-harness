export const validPromiseYaml = `
apiVersion: 1
id: harness.promise_registry.load_canonical_yaml_promises
feature: Seed Harness / Promise Registry
title:
  en: Accepted promises are loaded from canonical YAML files
  zh-CN: 已接受的承诺会从 canonical YAML 文件中加载
purpose:
  en: Protect the seed Harness's reviewed behavior promises.
  zh-CN: 保护 seed Harness 能读取自己已批准的行为承诺。
priority: P0
boundary: unit
lifecycle: accepted
given:
  - en: A promise file exists under the promises root
    zh-CN: promises/ 目录下存在一个 promise 文件
when:
  - en: The seed Harness loads promise records
    zh-CN: seed Harness 加载 promise records
then:
  - en: The promise is decoded into a PromiseRecord
    zh-CN: 该 promise 会被解码成 PromiseRecord
observes:
  - promises/**/*.promise.yaml
failureMeaning:
  en: The Harness cannot trust its own reviewed behavior promises.
  zh-CN: Harness 无法信任自己已经 review 过的行为承诺。
review:
  approvedBy: xinyao
  approvedAt: "2026-05-24"
`;
