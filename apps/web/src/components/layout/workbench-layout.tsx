import {
  RiFileList3Line,
  RiGitBranchLine,
  RiInboxArchiveLine,
  RiNodeTree,
  RiPlayLine,
  RiRefreshLine,
  RiSearchLine,
  RiSettings3Line,
  RiSparklingLine,
} from "@remixicon/react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { harnessLocales, type AppLocale, useI18n } from "@/lib/i18n";

const sidebarStorageKey = "HARNESS_WEB_SIDEBAR_COLLAPSED";

type WorkbenchRoute =
  | "/"
  | "/map"
  | "/modules"
  | "/promises"
  | "/review"
  | "/generate"
  | "/runs"
  | "/settings";

type NavItem = {
  to: WorkbenchRoute;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

function readInitialSidebarState() {
  if (typeof window === "undefined") return false;

  const saved = window.localStorage.getItem(sidebarStorageKey);
  if (saved) return saved === "true";

  return window.matchMedia("(max-width: 960px)").matches;
}

export function WorkbenchLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { locale, setLocale, m } = useI18n();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readInitialSidebarState);
  const navItems: NavItem[] = [
    { to: "/", label: m.nav_overview({}, { locale }), icon: RiInboxArchiveLine },
    { to: "/map", label: m.nav_map({}, { locale }), icon: RiNodeTree },
    { to: "/modules", label: m.nav_modules({}, { locale }), icon: RiGitBranchLine },
    { to: "/promises", label: m.nav_promises({}, { locale }), icon: RiFileList3Line },
    { to: "/review", label: m.nav_review({}, { locale }), icon: RiInboxArchiveLine },
    { to: "/generate", label: m.nav_generate({}, { locale }), icon: RiSparklingLine },
    { to: "/runs", label: m.nav_runs({}, { locale }), icon: RiPlayLine },
    { to: "/settings", label: m.nav_settings({}, { locale }), icon: RiSettings3Line },
  ];
  const quickFilters = [
    m.filter_pending_review({}, { locale }),
    m.filter_high_priority({}, { locale }),
    m.filter_evidence_issue({}, { locale }),
    m.filter_missing_evidence({}, { locale }),
  ];

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <SidebarProvider
      open={!isSidebarCollapsed}
      onOpenChange={(open) => setIsSidebarCollapsed(!open)}
      className="h-dvh min-h-0 flex-col overflow-hidden bg-zinc-100 text-foreground"
      style={
        {
          "--sidebar-width": "216px",
          "--sidebar-width-icon": "56px",
        } as CSSProperties
      }
    >
      <header className="sticky top-0 z-40 flex h-12 min-w-0 shrink-0 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-4">
        <MobileSidebarBrand />
        <DesktopBrand />
        <div className="relative min-w-0 flex-1 md:max-w-xl">
          <RiSearchLine className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 text-xs sm:text-sm"
            placeholder={m.search_placeholder({}, { locale })}
          />
        </div>
        <select
          aria-label={m.locale_label({}, { locale })}
          className="hidden h-8 max-w-24 border bg-background px-2 text-xs md:block md:max-w-none"
          value={locale}
          onChange={(event) => setLocale(event.target.value as AppLocale)}
        >
          {harnessLocales.map((option) => (
            <option key={option} value={option}>
              {option === "zh-CN" ? m.locale_zh_cn({}, { locale }) : m.locale_en({}, { locale })}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          title={m.action_regenerate({}, { locale })}
          className="hidden md:inline-flex"
        >
          <RiRefreshLine />
          <span className="hidden xl:inline">{m.action_regenerate({}, { locale })}</span>
        </Button>
        <Button
          size="sm"
          title={m.action_run_tests({}, { locale })}
          className="hidden md:inline-flex"
        >
          <RiPlayLine />
          <span className="hidden xl:inline">{m.action_run_tests({}, { locale })}</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <WorkbenchSidebar
          navItems={navItems}
          pathname={pathname}
          quickFilters={quickFilters}
          locale={locale}
          setLocale={setLocale}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}

function MobileSidebarBrand() {
  const { locale, m } = useI18n();
  const { setOpenMobile } = useSidebar();

  return (
    <button
      type="button"
      aria-label={m.sidebar_open({}, { locale })}
      title={m.sidebar_open({}, { locale })}
      className="flex min-w-0 items-center gap-2 outline-none transition-opacity hover:opacity-80 focus-visible:ring-1 focus-visible:ring-ring/50 md:hidden"
      onClick={() => setOpenMobile(true)}
    >
      <BrandMark />
      <BrandText />
    </button>
  );
}

function DesktopBrand() {
  return (
    <div className="hidden min-w-0 items-center gap-2 sm:min-w-56 md:flex">
      <BrandMark />
      <BrandText />
    </div>
  );
}

function BrandMark() {
  return (
    <div className="grid size-7 shrink-0 place-items-center border bg-foreground text-background">
      <RiNodeTree className="size-4" />
    </div>
  );
}

function BrandText() {
  const { locale, m } = useI18n();

  return (
    <div className="hidden min-w-0 sm:block">
      <div className="truncate text-left text-sm font-medium leading-none">
        {m.app_title({}, { locale })}
      </div>
      <div className="truncate text-left text-[11px] text-muted-foreground">
        {m.app_subtitle({}, { locale })}
      </div>
    </div>
  );
}

function WorkbenchSidebar({
  navItems,
  pathname,
  quickFilters,
  locale,
  setLocale,
}: {
  navItems: NavItem[];
  pathname: string;
  quickFilters: string[];
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}) {
  const { m } = useI18n();

  return (
    <Sidebar collapsible="icon" className="top-12 h-[calc(100dvh-3rem)]">
      <SidebarHeader className="h-11 flex-row items-center justify-between border-b px-2 py-0">
        <div className="min-w-0 px-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          {m.app_subtitle({}, { locale })}
        </div>
        <SidebarTrigger
          aria-label={m.sidebar_collapse({}, { locale })}
          title={m.sidebar_collapse({}, { locale })}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="md:hidden">
          <SidebarGroupContent className="grid gap-2">
            <Button size="sm">
              <RiPlayLine />
              {m.action_run_tests({}, { locale })}
            </Button>
            <Button variant="outline" size="sm">
              <RiRefreshLine />
              {m.action_regenerate({}, { locale })}
            </Button>
            <select
              aria-label={m.locale_label({}, { locale })}
              className="h-8 border bg-background px-2 text-xs"
              value={locale}
              onChange={(event) => setLocale(event.target.value as AppLocale)}
            >
              {harnessLocales.map((option) => (
                <option key={option} value={option}>
                  {option === "zh-CN"
                    ? m.locale_zh_cn({}, { locale })
                    : m.locale_en({}, { locale })}
                </option>
              ))}
            </select>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarNavigation items={navItems} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>{m.quick_filters({}, { locale })}</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2 px-2">
            {quickFilters.map((item) => (
              <label key={item} className="flex h-7 items-center gap-2 text-sidebar-foreground/70">
                <input
                  type="checkbox"
                  defaultChecked
                  aria-label={item}
                  className="size-3 shrink-0 accent-foreground"
                />
                <span className="truncate">{item}</span>
              </label>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function SidebarNavigation({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;

        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              render={<Link to={item.to} onClick={() => setOpenMobile(false)} />}
              isActive={isActive}
              tooltip={item.label}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
