import type { CSSProperties, ReactNode } from "react";

export type SiteIconName = "home" | "family" | "search" | "calendar" | "more" | "account" | "arrow" | "book" | "close";

export function SiteIcon({ name, size = 22, style }: { name: SiteIconName; size?: number; style?: CSSProperties }) {
  const shapes = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h5v-7h4v7h5V9" /></>,
    family: <><rect x="8" y="2" width="8" height="5" rx="1" /><rect x="2" y="17" width="7" height="5" rx="1" /><rect x="15" y="17" width="7" height="5" rx="1" /><path d="M12 7v5M5.5 17v-5h13v5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6m10-6v6M3 11h18M7 15h3m4 0h3m-10 3h3" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    account: <><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    book: <><path d="M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1Zm0 0v15" /></>,
    close: <path d="m5 5 14 14M5 19 19 5" />,
  } satisfies Record<SiteIconName, ReactNode>;
  return <svg className="site-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>{shapes[name]}</svg>;
}
