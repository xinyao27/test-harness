import { messages } from "@test-harness/i18n";

import type {
  PromiseLifecycle,
  PromisePriority,
  ReviewState,
  RunStatus,
} from "@/data/harness-snapshot";
import type { AppLocale } from "@/lib/i18n";

type MessageModule = typeof messages;

export function getPriorityLabel(
  priority: PromisePriority,
  locale: AppLocale,
  messageModule: MessageModule,
) {
  if (priority === "P0") return messageModule.priority_p0({}, { locale });
  if (priority === "P1") return messageModule.priority_p1({}, { locale });
  return messageModule.priority_p2({}, { locale });
}

export function getLifecycleLabel(
  lifecycle: PromiseLifecycle,
  locale: AppLocale,
  messageModule: MessageModule,
) {
  if (lifecycle === "proposed") return messageModule.lifecycle_proposed({}, { locale });
  if (lifecycle === "accepted") return messageModule.lifecycle_accepted({}, { locale });
  if (lifecycle === "implemented") return messageModule.lifecycle_implemented({}, { locale });
  if (lifecycle === "changed_requires_review") {
    return messageModule.lifecycle_changed_requires_review({}, { locale });
  }
  return messageModule.lifecycle_deprecated({}, { locale });
}

export function getRunStatusLabel(
  status: RunStatus,
  locale: AppLocale,
  messageModule: MessageModule,
) {
  if (status === "unknown") return messageModule.run_status_unknown({}, { locale });
  if (status === "passing") return messageModule.run_status_passing({}, { locale });
  if (status === "failing") return messageModule.run_status_failing({}, { locale });
  if (status === "skipped") return messageModule.run_status_skipped({}, { locale });
  return messageModule.run_status_missing_evidence({}, { locale });
}

export function getReviewStateLabel(
  state: ReviewState,
  locale: AppLocale,
  messageModule: MessageModule,
) {
  if (state === "pending") return messageModule.review_state_pending({}, { locale });
  if (state === "approved") return messageModule.review_state_approved({}, { locale });
  if (state === "rejected") return messageModule.review_state_rejected({}, { locale });
  return messageModule.review_state_changes_requested({}, { locale });
}
