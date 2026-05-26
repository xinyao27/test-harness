import type { ReactNode } from "react";

import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { harnessLocales, useI18n, type AppLocale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import type { AppThemeMode, ThemeDefinition } from "@/lib/themes";
import { cn } from "@/lib/utils";

export function SettingsPanel() {
  const { locale, m, setLocale } = useI18n();
  const {
    borderRadiusPreset,
    mode,
    radiusPresets,
    setBorderRadiusPreset,
    setMode,
    setThemeId,
    themeId,
    themes,
  } = useTheme();
  const radiusLabels = {
    default: m.settings_radius_default({}, { locale }),
    small: m.settings_radius_small({}, { locale }),
    medium: m.settings_radius_medium({}, { locale }),
    large: m.settings_radius_large({}, { locale }),
  };
  const radiusDescriptions = {
    default: m.settings_radius_default_description({}, { locale }),
    small: m.settings_radius_small_description({}, { locale }),
    medium: m.settings_radius_medium_description({}, { locale }),
    large: m.settings_radius_large_description({}, { locale }),
  };

  return (
    <FieldGroup className="p-(--studio-panel-padding)">
      <SettingsGroup
        description={m.settings_language_description({}, { locale })}
        title={m.settings_language_title({}, { locale })}
      >
        <ToggleGroup
          value={[locale]}
          onValueChange={(value) => {
            const nextLocale = value[0];
            if (nextLocale) setLocale(nextLocale as AppLocale);
          }}
          variant="outline"
          className="grid w-full grid-cols-2 sm:max-w-xs"
        >
          {harnessLocales.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              aria-label={
                option === "zh-CN" ? m.locale_zh_cn({}, { locale }) : m.locale_en({}, { locale })
              }
            >
              {option === "zh-CN" ? m.locale_zh_cn({}, { locale }) : m.locale_en({}, { locale })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsGroup>

      <SettingsGroup
        description={m.settings_theme_description({}, { locale })}
        title={m.settings_theme_title({}, { locale })}
      >
        <ToggleGroup
          value={[mode]}
          onValueChange={(value) => {
            const nextMode = value[0];
            if (nextMode === "dark" || nextMode === "light") setMode(nextMode);
          }}
          variant="outline"
          className="grid w-full grid-cols-2 sm:max-w-xs"
        >
          <ToggleGroupItem value="dark" aria-label={m.settings_theme_dark({}, { locale })}>
            {m.settings_theme_dark({}, { locale })}
          </ToggleGroupItem>
          <ToggleGroupItem value="light" aria-label={m.settings_theme_light({}, { locale })}>
            {m.settings_theme_light({}, { locale })}
          </ToggleGroupItem>
        </ToggleGroup>
      </SettingsGroup>

      <SettingsGroup
        description={m.settings_color_theme_description({}, { locale })}
        title={m.settings_color_theme_title({}, { locale })}
      >
        <ThemeGrid
          activeId={themeId}
          mode={mode}
          onSelect={setThemeId}
          themes={themes}
          activeLabel={m.settings_active({}, { locale })}
        />
      </SettingsGroup>

      <SettingsGroup
        description={m.settings_radius_description({}, { locale })}
        title={m.settings_radius_title({}, { locale })}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {radiusPresets.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setBorderRadiusPreset(option.id)}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 text-left transition-colors",
                borderRadiusPreset === option.id
                  ? "border-ring bg-muted"
                  : "border-border hover:border-ring hover:bg-muted",
              )}
            >
              <span
                className="size-8 shrink-0 border border-border bg-card shadow-xs"
                style={{ borderRadius: option.values["--radius-md"] }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{radiusLabels[option.id]}</span>
                <span className="block text-xs text-muted-foreground">
                  {radiusDescriptions[option.id]}
                </span>
              </span>
              {borderRadiusPreset === option.id ? (
                <span
                  className="size-2 rounded-full bg-success"
                  aria-label={m.settings_active({}, { locale })}
                />
              ) : null}
            </button>
          ))}
        </div>
      </SettingsGroup>

      <Separator />

      <ItemGroup className="grid gap-(--studio-panel-gap) sm:grid-cols-2">
        <SettingItem
          label={m.settings_daemon_label({}, { locale })}
          value={m.settings_daemon_value({}, { locale })}
        />
        <SettingItem
          label={m.settings_filesystem_label({}, { locale })}
          value={m.settings_filesystem_value({}, { locale })}
        />
      </ItemGroup>

      <SettingNote
        body={m.settings_daemon_boundary({}, { locale })}
        title={m.settings_no_filesystem({}, { locale })}
      />
    </FieldGroup>
  );
}

function ThemeGrid({
  activeId,
  activeLabel,
  mode,
  onSelect,
  themes,
}: {
  activeId: string;
  activeLabel: string;
  mode: AppThemeMode;
  onSelect: (themeId: string) => void;
  themes: ThemeDefinition[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {themes.map((theme) => {
        const isActive = activeId === theme.id;
        const variant = theme[mode];

        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => onSelect(theme.id)}
            className={cn(
              "group flex min-w-0 items-center gap-3 rounded-md border p-3 text-left transition-colors",
              isActive ? "border-ring bg-muted" : "border-border hover:border-ring hover:bg-muted",
            )}
          >
            <span className="flex shrink-0 items-center gap-1">
              <span
                className="size-4 rounded-full border border-border"
                style={{ backgroundColor: variant.bgPreview }}
              />
              <span
                className="size-4 rounded-full border border-border"
                style={{ backgroundColor: variant.accentPreview }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{theme.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {theme.description}
              </span>
            </span>
            {isActive ? (
              <span className="size-2 rounded-full bg-success" aria-label={activeLabel} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SettingsGroup({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <FieldSet>
      <div>
        <FieldLegend>{title}</FieldLegend>
        <FieldDescription>{description}</FieldDescription>
      </div>
      {children}
    </FieldSet>
  );
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemDescription>{label}</ItemDescription>
        <ItemTitle>{value}</ItemTitle>
      </ItemContent>
    </Item>
  );
}

function SettingNote({ body, title }: { body: string; title: string }) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{body}</ItemDescription>
      </ItemContent>
    </Item>
  );
}
