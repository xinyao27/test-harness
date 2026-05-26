---
name: harness-studio-theme
description: 当修改 Harness Studio 的 apps/web 样式、设计 token、颜色主题、圆角预设或主题设置时使用。应用 Better Hub 风格的 shadcn 主题系统，保持组件样式语义化；如果需求只要求样式重构，不改变业务逻辑。
---

# Harness Studio 主题

凡是工作涉及 `apps/web` 的样式、主题 token、颜色模式、主题切换、圆角切换或视觉重构，都使用这个 skill。

## 真正的来源

- 主题定义在 `apps/web/src/lib/themes.ts`。
- 主题应用和持久化在 `apps/web/src/lib/theme.ts`。
- 全局 CSS 变量、Tailwind token 映射、字体、阴影、滚动条和派生 app token 在 `apps/web/src/index.css`。
- 用户可见的主题控制在 `apps/web/src/features/settings/settings-page.tsx`。
- 共享基础组件在 `apps/web/src/components/ui/`。

这套设计系统借鉴 Better Hub 和 shadcn，但本应用只保留 Harness Studio 真正使用的 token。不要引入 Better Hub 的产品专用 token，除非本地 UI 明确消费它们。

## Token 规则

优先使用语义化 Tailwind class 和 CSS 变量：

- 表面：`bg-background`、`bg-card`、`bg-popover`、`bg-muted`、`bg-accent`
- 文本：`text-foreground`、`text-card-foreground`、`text-muted-foreground`、`text-primary`、`text-destructive`
- 边框和焦点：`border-border`、`border-input`、`ring-ring`
- 应用表面：`bg-studio-shell`、`bg-studio-panel`、`bg-studio-flow-surface`
- 状态：`bg-status-success`、`text-status-success-foreground`、`bg-status-warning`、`bg-status-destructive` 等
- 可复用意图色：`bg-success`、`text-success`、`bg-warning`、`text-warning`、`text-destructive`

业务组件里避免使用：

- 原始颜色字面量，例如 `#fff`、`rgb(...)`、`rgba(...)`、`oklch(...)` 或任意值 `bg-[#...]`。
- 内联透明度修饰，例如 `bg-foreground/5`、`bg-muted/60`、`border-white/10` 或 `text-neutral-500`。
- 可以用语义 token 表达时，不要写一次性的 `dark:` 颜色。
- 不属于本应用的 Better Hub token，例如 `--code-*`、`--inline-code-*`、`--diff-*`、`--contrib-*`、`--link` 或 `--info`。
- 在 feature 代码里硬编码自定义阴影、自定义圆角或像素圆角。使用 `rounded-*`、`shadow-*` 和圆角预设。
- 硬编码零圆角，例如 `rounded-none`；使用 `rounded-sm`、`rounded-md` 或 `rounded-lg` 这类 token-backed 层级，确保圆角预设仍然生效。
- 任意字体或间距，例如 `text-[11px]`、`gap-[7px]` 或 `rounded-[10px]`。除非某个本地 CSS 变量已经拥有这个布局，否则使用 Tailwind 标准刻度。

如果一个新的视觉需求会在多个 feature 中复用，新增语义 token 或共享 UI primitive 样式，而不是复制原始 class。

## 设计思维

- 写 feature 样式前，先读 canonical primitive。卡片、弹窗、popover、菜单、徽章、输入框和按钮都先从 `apps/web/src/components/ui/` 开始；feature class 只负责局部布局。
- 层级优先来自字号、间距、表面和位置，而不是先加粗或加颜色。运营型界面应该安静、好扫。
- 圆角是一套系统。卡片、popover、控件、图节点和小状态 chip 应使用已有层级，不发明一次性圆角。
- 使用邻近对比原则看边框：同一条线在不同相邻表面之间读感不同。分隔线和内容框优先用 solid `border-border`，不要用透明度边框赌效果。
- 避免双重边框。如果组件、面板 handle 或共享 primitive 已经画了分隔线，不要贴着它再加 `border-t`、`border-b` 或 `border-r`。
- app 专属尺寸尽量留在拥有它的 app 附近。共享主题 token 应表达语义颜色、圆角、阴影和可复用表面语言，而不是单屏布局常量。
- 局部状态优先复用通用表面。只有状态会重复出现或承载稳定产品语义时，才新增全局 token。

## 只做样式重构的流程

1. 确认需求只涉及样式。除非用户明确要求，不改变数据流、行为、路由、store、promise 元数据或 API 调用。
2. 审计 feature 代码里的非语义样式：

```bash
rg -n '#[0-9a-fA-F]{3,8}|rgba\(|rgb\(|oklch\(|bg-\[|text-\[|border-\[|dark:|rounded-none|(bg|text|border|ring|outline|fill|stroke)-[A-Za-z0-9_-]+/[0-9]{1,3}' apps/web/src/features apps/web/src/components/layout apps/web/src/components/ui
rg -n -e '--(code|inline-code|diff|contrib|link|info)' apps/web/src
```

3. 将硬编码视觉替换为语义 token、共享 UI 组件或已有的 token 化 utility class。
4. 保持布局意图不变。样式重构可以调整间距、表面、边框、阴影和字体层级，但不要重排工作流或移除控件。
5. 检查全部主题维度：亮/暗模式、颜色主题和圆角预设。

## 视觉方向

- 密集、工作型的运营界面，不是营销页。
- 安静的表面、清晰的层级、克制的边框和小阴影。
- 卡片和面板应接近 shadcn New York：紧凑、token 化、便于扫描。
- 重新设计加载态时，优先用 skeleton，不用 loading spinner。
- 字体保持实用：UI 使用 Geist Sans，类似代码的 id 使用 Geist Mono。

## 代码约定

- 条件 class 优先用 `cn()`，不要用模板字符串拼接。
- feature 样式保持窄：只处理布局、间距和局部状态。重复视觉处理放进 UI primitive 或语义 token。
- 新增用户可见文案走现有 i18n messages。
- 新包通过 workspace catalog 增加，并在 workspace `package.json` 里使用 `catalog:`。
- 改 token 名称后，在整个 `apps/web/src` 搜索旧变量和旧 class。

## 验证

主题和样式工作需要运行：

```bash
pnpm --filter @test-harness/web check
pnpm --filter @test-harness/web build
```

应用运行时，还要在浏览器里验证：

- 主题切换会更新 `data-color-theme`。
- 亮/暗切换会正确更新 `data-theme` 和 `class="dark"`。
- 圆角切换会更新 `data-radius`，并能看到圆角变化。
- feature 页面仍然渲染正常，没有控制台错误。
