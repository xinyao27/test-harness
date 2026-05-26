import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";

export function GeneratePage() {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const { locale, m } = useI18n();
  const relatedModules =
    data?.modules.filter((module) =>
      ["protocol", "module-registry", "promise-registry"].includes(module.id),
    ) ?? [];

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{m.generate_step_context({}, { locale })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{m.generate_context_default({}, { locale })}</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            {relatedModules.map((module) => (
              <div key={module.id} className="border-l pl-2">
                {localizeText(module.title, locale)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.generate_step_draft({}, { locale })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <DraftField
            label={m.draft_title({}, { locale })}
            value={m.draft_title_value({}, { locale })}
          />
          <DraftField
            label={m.draft_purpose({}, { locale })}
            value={m.draft_purpose_value({}, { locale })}
          />
          <DraftField
            label={m.draft_given({}, { locale })}
            value={m.draft_given_value({}, { locale })}
          />
          <DraftField
            label={m.draft_when({}, { locale })}
            value={m.draft_when_value({}, { locale })}
          />
          <DraftField
            label={m.draft_then({}, { locale })}
            value={m.draft_then_value({}, { locale })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DraftField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="border-l pl-3 text-sm">{value}</div>
    </div>
  );
}
