import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkbenchSnapshot } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { localizeText } from "@/lib/localized-text";
import { useWorkbenchStore } from "@/stores/workbench-store";

import { ProjectMap } from "./project-map";

export function MapPage() {
  const { data } = useQuery({
    queryKey: ["workbench-snapshot"],
    queryFn: getWorkbenchSnapshot,
  });
  const selectedNodeId = useWorkbenchStore((state) => state.selectedNodeId);
  const { locale, m } = useI18n();
  const selectedSummary = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    const [, id] = selectedNodeId.split(":");
    const module = data.modules.find((item) => item.id === id);
    if (module) {
      return {
        title: localizeText(module.title, locale),
        body: localizeText(module.summary, locale),
        type: m.graph_kind_module({}, { locale }),
      };
    }
    const promise = data.promises.find((item) => item.id === id);
    if (promise) {
      return {
        title: localizeText(promise.title, locale),
        body: localizeText(promise.purpose, locale),
        type: m.graph_kind_promise({}, { locale }),
      };
    }
    return {
      title: id,
      body: m.graph_evidence_fallback({}, { locale }),
      type: m.graph_kind_evidence({}, { locale }),
    };
  }, [data, locale, m, selectedNodeId]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto overflow-x-hidden p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:overflow-hidden">
      <section className="flex min-h-[520px] min-w-0 flex-col gap-3 xl:min-h-0">
        <div>
          <div className="min-w-0">
            <h1 className="text-lg">{m.map_title({}, { locale })}</h1>
          </div>
        </div>
        <div className="min-h-0 flex-1">{data ? <ProjectMap snapshot={data} /> : null}</div>
      </section>

      <aside className="min-w-0 space-y-3 xl:sticky xl:top-0 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedSummary ? selectedSummary.type : m.map_selected_title({}, { locale })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedSummary ? (
              <>
                <div className="text-sm">{selectedSummary.title}</div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{selectedSummary.body}</p>
              </>
            ) : (
              <div className="border bg-muted p-3 text-xs text-muted-foreground">
                {m.map_selected_empty({}, { locale })}
              </div>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
