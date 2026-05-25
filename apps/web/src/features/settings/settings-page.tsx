import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export function SettingsPage() {
  const { locale, m } = useI18n();

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{m.settings_title({}, { locale })}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <SettingItem
            label={m.settings_daemon_label({}, { locale })}
            value={m.settings_daemon_value({}, { locale })}
          />
          <SettingItem
            label={m.settings_filesystem_label({}, { locale })}
            value={m.settings_filesystem_value({}, { locale })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm">{value}</div>
    </div>
  );
}
