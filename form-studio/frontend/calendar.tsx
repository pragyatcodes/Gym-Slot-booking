import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ArrowUpRight, Plus, Sparkles } from "lucide-react";
import { GlassCalendar } from "@/components/ui/glass-calendar";
import MetallicButton from "@/components/ui/button-metallic";
import ProfileCard from "@/components/ui/profile-card";
import {
  CustomCursor,
  useCustomCursorContext,
} from "@/components/ui/custom-cursor";
import "@/styles/calendar.css";

export interface CalendarMountOptions {
  selectedDate: string;
  today: string;
  sessionCounts: Record<string, number>;
  userId: number;
  onDateSelect: (date: string) => void;
  onNewEvent?: () => void;
  onViewSessions?: () => void;
}

export interface MetallicMountOptions {
  label: string;
  icon?: "arrow" | "sparkles" | "plus";
  size?: "sm" | "md" | "icon";
  type?: "button" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

let root: Root | null = null;
let container: HTMLElement | null = null;
let currentOptions: CalendarMountOptions | null = null;
const metallicRoots = new Map<HTMLElement, Root>();

const parseDate = (date: string) => new Date(`${date}T12:00:00`);
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function renderCalendar() {
  if (!root || !currentOptions) return;
  const options = currentOptions;
  root.render(
    <GlassCalendar
      selectedDate={parseDate(options.selectedDate)}
      today={parseDate(options.today)}
      sessionCounts={options.sessionCounts}
      notesKey={`form-calendar:user:${options.userId}`}
      onDateSelect={(date) => {
        const key = dateKey(date);
        currentOptions = { ...options, selectedDate: key };
        renderCalendar();
        options.onDateSelect(key);
      }}
      onNewEvent={options.onNewEvent}
      onViewSessions={options.onViewSessions}
      aria-label="Session calendar"
      className="max-w-none"
    />,
  );
}

export function mount(element: HTMLElement, options: CalendarMountOptions) {
  if (container !== element) {
    unmount();
    container = element;
    root = createRoot(element);
  }
  currentOptions = options;
  renderCalendar();
}

export function unmount() {
  root?.unmount();
  root = null;
  container = null;
  currentOptions = null;
}

function Icon({ name }: { name?: MetallicMountOptions["icon"] }) {
  if (name === "sparkles") return <Sparkles className="size-4" />;
  if (name === "plus") return <Plus className="size-4" />;
  return <ArrowUpRight className="size-4" />;
}

export function mountMetallic(element: HTMLElement, options: MetallicMountOptions) {
  let node = metallicRoots.get(element);
  if (!node) {
    node = createRoot(element);
    metallicRoots.set(element, node);
  }
  node.render(
    <MetallicButton
      type={options.type || "button"}
      size={options.size || "md"}
      disabled={options.disabled}
      aria-label={options.ariaLabel}
      onClick={options.onClick}
      className="w-full"
    >
      {options.size === "icon" ? (
        <Sparkles className="size-4" />
      ) : (
        <>
          {options.label}
          <Icon name={options.icon} />
        </>
      )}
    </MetallicButton>,
  );
}

export function unmountMetallics() {
  metallicRoots.forEach((node) => node.unmount());
  metallicRoots.clear();
}

let profileRoot: Root | null = null;
let profileHost: HTMLElement | null = null;

export function mountProfile(
  element: HTMLElement,
  options: { name: string; role: string; imageSrc: string },
) {
  if (profileHost !== element) {
    unmountProfile();
    profileHost = element;
    profileRoot = createRoot(element);
  }
  profileRoot?.render(
    <div className="dark">
      <ProfileCard
        imageSrc={options.imageSrc}
        name={options.name}
        role={options.role}
        className="justify-end"
      />
    </div>,
  );
}

export function unmountProfile() {
  profileRoot?.unmount();
  profileRoot = null;
  profileHost = null;
}

const HOVER_SELECTOR =
  "a, button, [role='button'], [data-cursor], [data-metallic], .chip, .day, .nav-link, .session-card, .metallic-host, .profile-identity, #react-profile, .icon-button, label, select, summary";

function CursorHoverBridge() {
  const { setIsHovering } = useCustomCursorContext();
  React.useEffect(() => {
    const onOver = (event: PointerEvent) => {
      const node = event.target as Element | null;
      setIsHovering(Boolean(node?.closest?.(HOVER_SELECTOR)));
    };
    document.addEventListener("pointerover", onOver);
    return () => document.removeEventListener("pointerover", onOver);
  }, [setIsHovering]);
  return null;
}

let cursorRoot: Root | null = null;

export function mountCursor(element: HTMLElement) {
  if (!cursorRoot) cursorRoot = createRoot(element);
  cursorRoot.render(
    <CustomCursor color="#ffab78" className="pointer-events-none">
      <CursorHoverBridge />
    </CustomCursor>,
  );
  document.documentElement.classList.add("custom-cursor-on");
}

export function hydrateMetallics(rootEl: ParentNode = document) {
  rootEl.querySelectorAll<HTMLElement>("[data-metallic]").forEach((el) => {
    mountMetallic(el, {
      label: el.dataset.label || "",
      icon: el.dataset.icon as MetallicMountOptions["icon"],
      size: el.dataset.size as MetallicMountOptions["size"],
      type: (el.dataset.type as MetallicMountOptions["type"]) || "button",
      disabled: el.dataset.disabled === "true",
      ariaLabel: el.dataset.ariaLabel,
      onClick:
        el.dataset.type === "submit"
          ? undefined
          : () => {
              el.dispatchEvent(
                new CustomEvent("metallic-click", {
                  bubbles: true,
                  detail: { action: el.dataset.action, id: el.dataset.id },
                }),
              );
            },
    });
  });
}

declare global {
  interface Window {
    FormCalendar: {
      mount: typeof mount;
      unmount: typeof unmount;
      mountMetallic: typeof mountMetallic;
      hydrateMetallics: typeof hydrateMetallics;
      unmountMetallics: typeof unmountMetallics;
      mountProfile: typeof mountProfile;
      unmountProfile: typeof unmountProfile;
      mountCursor: typeof mountCursor;
    };
  }
}

if (typeof window !== "undefined") {
  window.FormCalendar = {
    mount,
    unmount,
    mountMetallic,
    hydrateMetallics,
    unmountMetallics,
    mountProfile,
    unmountProfile,
    mountCursor,
  };
}
