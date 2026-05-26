import type { ReactNode } from "react";

import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { harnessLocales, useI18n, type AppLocale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function SettingsPanel() {
  const { locale, m, setLocale } = useI18n();
  const { setTheme, theme } = useTheme();

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
          spacing={0}
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
          value={[theme]}
          onValueChange={(value) => {
            const nextTheme = value[0];
            if (nextTheme === "dark" || nextTheme === "light") setTheme(nextTheme);
          }}
          spacing={0}
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
