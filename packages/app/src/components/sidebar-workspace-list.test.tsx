/**
 * @vitest-environment jsdom
 */
import { act } from "@testing-library/react";
import type { DaemonClient } from "@server/client/daemon-client";
import type { WorkspaceScriptPayload } from "@server/shared/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import React from "react";
import type { ReactElement } from "react";

const { routerNavigate, theme, toastMock } = vi.hoisted(() => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
  return {
    routerNavigate: vi.fn(),
    theme: {
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
      iconSize: { md: 18 },
      borderRadius: { sm: 4, md: 6, lg: 8, xl: 12, full: 999 },
      fontSize: { xs: 11, sm: 13 },
      fontWeight: { medium: "500", normal: "400" },
      opacity: { 50: 0.5 },
      shadow: { md: {} },
      colors: {
        accent: "#2563eb",
        destructive: "#ef4444",
        surface0: "#ffffff",
        surface2: "#eeeeee",
        surface3: "#dddddd",
        surfaceSidebarHover: "#f3f4f6",
        foreground: "#111827",
        foregroundMuted: "#6b7280",
        border: "#d1d5db",
        borderAccent: "#9ca3af",
        palette: {
          amber: { 500: "#f59e0b", 700: "#b45309" },
          blue: { 500: "#3b82f6" },
          green: { 500: "#22c55e" },
          purple: { 500: "#a855f7" },
          red: { 500: "#ef4444" },
          white: "#ffffff",
        },
      },
    },
    toastMock: {
      copied: vi.fn(),
      error: vi.fn(),
    },
  };
});

import {
  createSidebarWorkspaceEntry,
  type SidebarProjectEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarWorkspacesList } from "@/hooks/use-sidebar-workspaces-list";
import { patchWorkspaceScripts } from "@/contexts/session-workspace-scripts";
import {
  getHostRuntimeStore,
  type HostRuntimeController,
  type HostRuntimeSnapshot,
} from "@/runtime/host-runtime";
import type { HostProfile } from "@/types/host-connection";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import {
  activateNavigationWorkspaceSelection,
  syncNavigationActiveWorkspace,
  useIsNavigationProjectActive,
  useIsNavigationWorkspaceSelected,
} from "@/stores/navigation-active-workspace-store";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    absoluteFillObject: {},
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  useUnistyles: () => ({ theme }),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  notificationAsync: vi.fn(),
  selectionAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));

vi.mock("expo-router", () => ({
  router: {
    navigate: routerNavigate,
  },
  usePathname: () => "/h/sidebar-render-count/open-project",
}));

vi.mock("react-native-draggable-flatlist", () => ({
  NestableScrollContainer: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("react-native-reanimated", () => ({
  default: {
    View: "div",
  },
  Easing: { linear: "linear" },
  Extrapolation: { CLAMP: "clamp" },
  interpolate: () => 0,
  makeMutable: (value: unknown) => ({ value }),
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }),
  withRepeat: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

vi.mock("lucide-react-native", () => {
  const Icon = () => null;
  return {
    Archive: Icon,
    CircleAlert: Icon,
    ChevronDown: Icon,
    ChevronRight: Icon,
    Copy: Icon,
    ExternalLink: Icon,
    FolderPlus: Icon,
    FolderGit2: Icon,
    GitPullRequest: Icon,
    Globe: Icon,
    SquareTerminal: Icon,
    Monitor: Icon,
    MoreVertical: Icon,
    Plus: Icon,
    Trash2: Icon,
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueries: () => [],
  };
});

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => true,
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => toastMock,
}));

vi.mock("@/hooks/use-checkout-pr-status-query", () => ({
  useWorkspacePrHint: () => null,
}));

vi.mock("@/hooks/use-show-shortcut-badges", () => ({
  useShowShortcutBadges: () => false,
}));

vi.mock("@/hooks/use-shortcut-keys", () => ({
  useShortcutKeys: () => null,
}));

vi.mock("@/hooks/use-keyboard-action-handler", () => ({
  useKeyboardActionHandler: () => undefined,
}));

vi.mock("@/components/workspace-hover-card", () => ({
  WorkspaceHoverCard: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/icons/github-icon", () => ({
  GitHubIcon: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/shortcut", () => ({
  Shortcut: () => null,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => children,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => children,
  ContextMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) =>
    React.createElement("button", { type: "button", onClick: onSelect }, children),
  ContextMenuTrigger: ({
    children,
    onPress,
    testID,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": testID, onClick: onPress },
      children,
    ),
  useContextMenu: () => ({
    open: false,
    openAt: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({
    children,
    testID,
    accessibilityLabel,
    disabled,
  }: {
    children:
      | React.ReactNode
      | ((state: { hovered: boolean; pressed: boolean; open: boolean }) => React.ReactNode);
    testID?: string;
    accessibilityLabel?: string;
    disabled?: boolean;
  }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": testID, "aria-label": accessibilityLabel, disabled },
      typeof children === "function"
        ? children({ hovered: false, pressed: false, open: false })
        : children,
    ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DropdownMenuItem: ({
    children,
    onSelect,
    testID,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    testID?: string;
    disabled?: boolean;
  }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": testID, disabled, onClick: onSelect },
      children,
    ),
}));

vi.mock("./draggable-list", () => ({
  DraggableList: ({
    data,
    renderItem,
    keyExtractor,
    testID,
  }: {
    data: unknown[];
    renderItem: (input: {
      item: unknown;
      index: number;
      drag: () => void;
      isActive: boolean;
      dragHandleProps: undefined;
    }) => ReactElement;
    keyExtractor: (item: unknown) => string;
    testID?: string;
  }) =>
    React.createElement(
      "div",
      { "data-testid": testID },
      data.map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: keyExtractor(item) },
          renderItem({
            item,
            index,
            drag: vi.fn(),
            isActive: false,
            dragHandleProps: undefined,
          }),
        ),
      ),
    ),
}));

const SERVER_ID = "sidebar-render-count";

interface RenderCounts {
  frame: number;
  headers: Record<string, number>;
  rows: Record<string, number>;
  projectSelection: Record<string, number>;
  rowSelection: Record<string, number>;
}

const runningScript: WorkspaceScriptPayload = {
  scriptName: "web",
  type: "service",
  hostname: "web.paseo.localhost",
  port: 3000,
  proxyUrl: "http://web.paseo.localhost:6767",
  lifecycle: "running",
  health: "healthy",
  exitCode: null,
  terminalId: null,
};

function workspace(input: {
  id: string;
  projectId: string;
  projectDisplayName: string;
  name: string;
  status?: WorkspaceDescriptor["status"];
  scripts?: WorkspaceDescriptor["scripts"];
}): WorkspaceDescriptor {
  return {
    id: input.id,
    projectId: input.projectId,
    projectDisplayName: input.projectDisplayName,
    projectRootPath: `/repo/${input.projectId}`,
    workspaceDirectory: `/repo/${input.projectId}/${input.id}`,
    projectKind: "git",
    workspaceKind: input.name === "main" ? "local_checkout" : "worktree",
    name: input.name,
    status: input.status ?? "done",
    diffStat: null,
    scripts: input.scripts ?? [],
  };
}

function createWorkspaces(): WorkspaceDescriptor[] {
  return [
    workspace({
      id: "a-main",
      projectId: "project-a",
      projectDisplayName: "Project A",
      name: "main",
      scripts: [runningScript],
    }),
    workspace({
      id: "a-one",
      projectId: "project-a",
      projectDisplayName: "Project A",
      name: "one",
    }),
    workspace({
      id: "a-two",
      projectId: "project-a",
      projectDisplayName: "Project A",
      name: "two",
    }),
    workspace({
      id: "b-main",
      projectId: "project-b",
      projectDisplayName: "Project B",
      name: "main",
    }),
    workspace({
      id: "b-one",
      projectId: "project-b",
      projectDisplayName: "Project B",
      name: "one",
    }),
    workspace({
      id: "b-two",
      projectId: "project-b",
      projectDisplayName: "Project B",
      name: "two",
    }),
  ];
}

function makeHost(): HostProfile {
  const now = "2026-04-19T00:00:00.000Z";
  return {
    serverId: SERVER_ID,
    label: "Render Count Host",
    lifecycle: {},
    connections: [],
    preferredConnectionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function initializeSidebarState(workspaces: WorkspaceDescriptor[]): void {
  act(() => {
    getHostRuntimeStore().syncHosts([makeHost()]);
    useSessionStore.getState().initializeSession(SERVER_ID, null as unknown as DaemonClient);
    useSessionStore
      .getState()
      .setWorkspaces(SERVER_ID, new Map(workspaces.map((entry) => [entry.id, entry])));
    useSessionStore.getState().setHasHydratedWorkspaces(SERVER_ID, true);
    useSidebarOrderStore.setState({
      projectOrderByServerId: {
        [SERVER_ID]: ["project-a", "project-b"],
      },
      workspaceOrderByServerAndProject: {
        [`${SERVER_ID}::project-a`]: [
          `${SERVER_ID}:a-main`,
          `${SERVER_ID}:a-one`,
          `${SERVER_ID}:a-two`,
        ],
        [`${SERVER_ID}::project-b`]: [
          `${SERVER_ID}:b-main`,
          `${SERVER_ID}:b-one`,
          `${SERVER_ID}:b-two`,
        ],
      },
    });
  });
}

function createSidebarProjects(workspaces: WorkspaceDescriptor[]): SidebarProjectEntry[] {
  return ["project-a", "project-b"].map((projectId) => {
    const projectWorkspaces = workspaces.filter((entry) => entry.projectId === projectId);
    const firstWorkspace = projectWorkspaces[0];
    if (!firstWorkspace) {
      throw new Error(`Missing test workspaces for ${projectId}`);
    }
    return {
      projectKey: projectId,
      projectName: firstWorkspace.projectDisplayName,
      projectKind: firstWorkspace.projectKind,
      iconWorkingDir: firstWorkspace.projectRootPath ?? "",
      workspaces: projectWorkspaces.map((entry) =>
        createSidebarWorkspaceEntry({ serverId: SERVER_ID, workspace: entry }),
      ),
    };
  });
}

function resetCounts(counts: RenderCounts): void {
  counts.frame = 0;
  counts.headers = {};
  counts.rows = {};
  counts.projectSelection = {};
  counts.rowSelection = {};
}

function incrementRecord(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function ProjectHeaderProbe({
  project,
  counts,
}: {
  project: SidebarProjectEntry;
  counts: RenderCounts;
}): null {
  incrementRecord(counts.headers, project.projectKey);
  return null;
}

function WorkspaceRowProbe({
  serverId,
  workspaceId,
  counts,
}: {
  serverId: string;
  workspaceId: string;
  counts: RenderCounts;
}): null {
  const workspaceEntry = useWorkspaceFields(serverId, workspaceId, (entry) =>
    createSidebarWorkspaceEntry({ serverId, workspace: entry }),
  );
  if (workspaceEntry) {
    incrementRecord(counts.rows, workspaceEntry.workspaceId);
  }
  return null;
}

function ProjectActiveProbe({
  serverId,
  project,
  counts,
}: {
  serverId: string;
  project: SidebarProjectEntry;
  counts: RenderCounts;
}): null {
  useIsNavigationProjectActive({
    serverId,
    workspaceIds: project.workspaces.map((entry) => entry.workspaceId),
  });
  incrementRecord(counts.projectSelection, project.projectKey);
  return null;
}

function WorkspaceSelectionProbe({
  serverId,
  workspaceId,
  counts,
}: {
  serverId: string;
  workspaceId: string;
  counts: RenderCounts;
}): null {
  useIsNavigationWorkspaceSelected({ serverId, workspaceId });
  incrementRecord(counts.rowSelection, workspaceId);
  return null;
}

function SidebarFrameProbe({ counts }: { counts: RenderCounts }): ReactElement {
  counts.frame += 1;
  const { projects } = useSidebarWorkspacesList({ serverId: SERVER_ID });

  return (
    <>
      {projects.map((project) => (
        <div key={project.projectKey}>
          <ProjectHeaderProbe project={project} counts={counts} />
          <ProjectActiveProbe serverId={SERVER_ID} project={project} counts={counts} />
          {project.workspaces.map((entry) => (
            <React.Fragment key={entry.workspaceKey}>
              <WorkspaceRowProbe
                serverId={entry.serverId}
                workspaceId={entry.workspaceId}
                counts={counts}
              />
              <WorkspaceSelectionProbe
                serverId={entry.serverId}
                workspaceId={entry.workspaceId}
                counts={counts}
              />
            </React.Fragment>
          ))}
        </div>
      ))}
    </>
  );
}

function getHostController(): HostRuntimeController {
  const controllers = (
    getHostRuntimeStore() as unknown as {
      controllers: Map<string, HostRuntimeController>;
    }
  ).controllers;
  const controller = controllers.get(SERVER_ID);
  if (!controller) {
    throw new Error("Host runtime controller was not initialized");
  }
  return controller;
}

function updateControllerSnapshot(
  patch: Partial<Omit<HostRuntimeSnapshot, "serverId" | "clientGeneration">>,
): void {
  (
    getHostController() as unknown as {
      updateSnapshot: (
        patch: Partial<Omit<HostRuntimeSnapshot, "serverId" | "clientGeneration">>,
      ) => void;
    }
  ).updateSnapshot(patch);
}

async function renderProbe(counts: RenderCounts): Promise<{ root: Root; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SidebarFrameProbe counts={counts} />);
  });
  resetCounts(counts);
  return { root, container };
}

async function renderSidebarList(
  projects: SidebarProjectEntry[],
): Promise<{ root: Root; container: HTMLElement }> {
  (globalThis as unknown as { React: typeof React }).React = React;
  const sidebarModule = await import("./sidebar-workspace-list");
  const { SidebarWorkspaceList } = sidebarModule;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SidebarWorkspaceList
        projects={projects}
        serverId={SERVER_ID}
        collapsedProjectKeys={new Set()}
        onToggleProjectCollapsed={vi.fn()}
        shortcutIndexByWorkspaceKey={new Map()}
        onWorkspacePress={vi.fn()}
      />,
    );
  });
  return { root, container };
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("sidebar workspace actions", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    routerNavigate.mockReset();
    toastMock.copied.mockReset();
    toastMock.error.mockReset();
    initializeSidebarState(createWorkspaces());
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    act(() => {
      syncNavigationActiveWorkspace({ current: null });
      getHostRuntimeStore().syncHosts([]);
      useSessionStore.getState().clearSession(SERVER_ID);
      useSidebarOrderStore.setState({
        projectOrderByServerId: {},
        workspaceOrderByServerAndProject: {},
      });
    });
  });

  it("opens new workspace setup from the local checkout branch row", async () => {
    ({ root, container } = await renderSidebarList(createSidebarProjects(createWorkspaces())));

    const branchButton = container.querySelector(
      '[data-testid="sidebar-workspace-create-from-branch-sidebar-render-count:a-main"]',
    );
    const worktreeButton = container.querySelector(
      '[data-testid="sidebar-workspace-create-from-branch-sidebar-render-count:a-one"]',
    );

    expect(branchButton).not.toBeNull();
    expect(worktreeButton).toBeNull();

    await click(branchButton!);

    expect(routerNavigate).toHaveBeenCalledWith(
      "/h/sidebar-render-count/new?dir=%2Frepo%2Fproject-a%2Fa-main&name=Project+A&ref=main",
    );
  });
});

describe("sidebar workspace render isolation", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    initializeSidebarState(createWorkspaces());
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    act(() => {
      syncNavigationActiveWorkspace({ current: null });
      getHostRuntimeStore().syncHosts([]);
      useSessionStore.getState().clearSession(SERVER_ID);
      useSidebarOrderStore.setState({
        projectOrderByServerId: {},
        workspaceOrderByServerAndProject: {},
      });
    });
  });

  it("re-renders only the changed workspace row for a status update", async () => {
    const counts: RenderCounts = {
      frame: 0,
      headers: {},
      rows: {},
      projectSelection: {},
      rowSelection: {},
    };
    ({ root, container } = await renderProbe(counts));

    act(() => {
      useSessionStore.getState().mergeWorkspaces(SERVER_ID, [
        {
          ...createWorkspaces()[1]!,
          status: "running",
        },
      ]);
    });

    expect(counts.frame).toBe(0);
    expect(counts.headers).toEqual({});
    expect(counts.rows).toEqual({ "a-one": 1 });
  });

  it("does not re-render the sidebar for a host-runtime probe tick with no content change", async () => {
    const counts: RenderCounts = {
      frame: 0,
      headers: {},
      rows: {},
      projectSelection: {},
      rowSelection: {},
    };
    ({ root, container } = await renderProbe(counts));

    act(() => {
      const probeByConnectionId = getHostController().getSnapshot().probeByConnectionId;
      updateControllerSnapshot({
        probeByConnectionId: new Map(probeByConnectionId),
      });
    });

    expect(counts).toEqual({
      frame: 0,
      headers: {},
      rows: {},
      projectSelection: {},
      rowSelection: {},
    });
  });

  it("does not re-render for a deep-equal scripts patch", async () => {
    const counts: RenderCounts = {
      frame: 0,
      headers: {},
      rows: {},
      projectSelection: {},
      rowSelection: {},
    };
    ({ root, container } = await renderProbe(counts));

    const applyRunningScript = (current: Parameters<typeof patchWorkspaceScripts>[0]) =>
      patchWorkspaceScripts(current, {
        workspaceId: "a-main",
        scripts: [{ ...runningScript }],
      });

    act(() => {
      useSessionStore.getState().setWorkspaces(SERVER_ID, applyRunningScript);
    });

    expect(counts).toEqual({
      frame: 0,
      headers: {},
      rows: {},
      projectSelection: {},
      rowSelection: {},
    });
  });

  it("isolates active selection updates to affected row and project boolean probes", async () => {
    const counts: RenderCounts = {
      frame: 0,
      headers: {},
      rows: {},
      projectSelection: {},
      rowSelection: {},
    };

    act(() => {
      activateNavigationWorkspaceSelection({
        serverId: SERVER_ID,
        workspaceId: "a-one",
      });
    });
    ({ root, container } = await renderProbe(counts));

    act(() => {
      activateNavigationWorkspaceSelection({
        serverId: SERVER_ID,
        workspaceId: "b-two",
      });
    });

    expect(counts.frame).toBe(0);
    expect(counts.headers).toEqual({});
    expect(counts.rows).toEqual({});
    expect(counts.projectSelection).toEqual({
      "project-a": 1,
      "project-b": 1,
    });
    expect(counts.rowSelection).toEqual({
      "a-one": 1,
      "b-two": 1,
    });
  });
});
