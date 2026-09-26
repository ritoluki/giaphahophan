import Link from "next/link";
import type { ReactNode } from "react";
import { SiteShell, type NavKey } from "./site-chrome";

type FoundationPageProps = {
  kicker: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  active?: NavKey;
  children?: ReactNode;
};

export function FoundationPage({ kicker, title, description, actionHref, actionLabel, active = "more", children }: FoundationPageProps) {
  return (
    <SiteShell active={active}>
      <main id="main-content" className="container page">
        <p className="eyebrow">{kicker}</p>
        <h1>{title}</h1>
        <div className="card"><p>{description}</p>{actionHref && actionLabel ? <Link className="button-primary" href={actionHref}>{actionLabel}</Link> : null}{children}</div>
      </main>
    </SiteShell>
  );
}
