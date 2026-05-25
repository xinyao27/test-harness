import { RiCheckboxCircleLine, RiLoopRightLine, RiSparklingLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>{m.generate_step_context({}, { locale })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            className="min-h-36"
            defaultValue={m.generate_context_default({}, { locale })}
          />
          <div className="space-y-2 text-xs text-muted-foreground">
            {relatedModules.map((module) => (
              <label key={module.id} className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="size-3 accent-foreground" />
                {localizeText(module.title, locale)}
              </label>
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
          <Button variant="outline" size="sm">
            <RiLoopRightLine />
            {m.action_regenerate({}, { locale })}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.generate_step_decision({}, { locale })}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button>
            <RiCheckboxCircleLine />
            {m.action_approve_and_write({}, { locale })}
          </Button>
          <Button variant="outline">
            <RiSparklingLine />
            {m.action_save_draft({}, { locale })}
          </Button>
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
