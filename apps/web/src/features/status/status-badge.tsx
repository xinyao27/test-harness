import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import type {
  PromiseLifecycle,
  PromisePriority,
  ReviewState,
  RunStatus,
} from "@/data/harness-snapshot";
import { useI18n } from "@/lib/i18n";

import {
  getLifecycleLabel,
  getPriorityLabel,
  getReviewStateLabel,
  getRunStatusLabel,
} from "./status-labels";

type StatusBadgeSize = ComponentProps<typeof Badge>["size"];

export function PriorityBadge({ priority }: { priority: PromisePriority }) {
  const { locale, m } = useI18n();

  return (
    <Badge
      variant={priority === "P0" ? "default" : "secondary"}
      className={priority === "P0" ? "bg-primary text-primary-foreground" : ""}
    >
      {getPriorityLabel(priority, locale, m)}
    </Badge>
  );
}

export function LifecycleBadge({
  lifecycle,
  size,
}: {
  lifecycle: PromiseLifecycle;
  size?: StatusBadgeSize;
}) {
  const { locale, m } = useI18n();

  return (
    <Badge size={size} variant={lifecycle === "accepted" ? "outline" : "secondary"}>
      {getLifecycleLabel(lifecycle, locale, m)}
    </Badge>
  );
}

export function RunStatusBadge({ size, status }: { size?: StatusBadgeSize; status: RunStatus }) {
  const { locale, m } = useI18n();

  const className = {
    unknown: "border-border text-muted-foreground",
    passing: "border-status-success-border text-status-success-foreground",
    failing: "border-destructive text-destructive",
    skipped: "border-border text-muted-foreground",
    missing_evidence: "border-status-warning-border text-status-warning-foreground",
  }[status];

  return (
    <Badge size={size} variant="outline" className={className}>
      {getRunStatusLabel(status, locale, m)}
    </Badge>
  );
}

export function ReviewStateBadge({ state }: { state: ReviewState }) {
  const { locale, m } = useI18n();

  return (
    <Badge variant={state === "pending" ? "default" : "secondary"}>
      {getReviewStateLabel(state, locale, m)}
    </Badge>
  );
}
