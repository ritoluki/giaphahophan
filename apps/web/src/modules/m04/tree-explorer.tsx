"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { branchName, demoBranches, demoFamilyDataset, demoPeople, getDemoFamilyView } from "../../lib/demo-data";
import { familyHref, normalizeFamilySearch, readFamilyOptions, type FamilyMember, type FamilyPerson, type FamilyViewOptions } from "../../lib/family-view-model";
import "./tree-explorer.css";

const FamilyDiagram = dynamic(() => import("./family-diagram"), {
  ssr: false,
  loading: () => <p className="family-diagram-message" role="status">Đang mở sơ đồ gia đình…</p>
});

export function FamilyPersonRow({ person, labels = [], current = false, options }: {
  person: FamilyPerson;
  labels?: readonly string[];
  current?: boolean;
  options: FamilyViewOptions;
}) {
  const returnTo = familyHref(options);
  return (
    <article className={`family-person-row${current ? " family-person-current" : ""}`}>
      <div className="family-person-description">
        {current ? <span className="family-person-marker">Đang xem</span> : null}
        <h3>{person.displayName}</h3>
        <p>{person.yearLabel === "Chưa rõ" ? "Chưa rõ năm sinh" : `Sinh năm ${person.yearLabel}`} · {branchName(person.primaryBranchId)}</p>
        {labels.length ? <p className="family-relationship-label">{labels.join("; ")}</p> : null}
      </div>
      <div className="family-person-actions">
        {!current ? <Link href={familyHref({ ...options, rootId: person.id, view: "family" })} scroll={false}>Xem gia đình<span className="sr-only"> của {person.displayName}</span></Link> : null}
        <Link href={`/nguoi/${person.id}?from=${encodeURIComponent(returnTo)}`}>Xem hồ sơ<span className="sr-only"> {person.displayName}</span></Link>
      </div>
    </article>
  );
}

function FamilyGroup({ title, members, options, className = "" }: {
  title: string;
  members: readonly FamilyMember[];
  options: FamilyViewOptions;
  className?: string;
}) {
  const headingId = useId();
  const filtered = options.branchId ? members.filter((member) => member.person.primaryBranchId === options.branchId) : members;
  return (
    <section className={`family-group ${className}`} aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {filtered.length ? <div className="family-members">{filtered.map((member) => <FamilyPersonRow key={member.person.id} person={member.person} labels={member.relationshipLabels} options={options} />)}</div> : <p className="family-empty">{members.length && options.branchId ? "Không có hồ sơ thuộc chi đang chọn trong nhóm này." : "Chưa có thông tin được ghi nhận."}</p>}
    </section>
  );
}

function PersonChooser({ options, onChoose }: { options: FamilyViewOptions; onChoose: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const id = useId();
  const normalized = normalizeFamilySearch(query);
  const people = demoPeople.filter((person) => (!options.branchId || person.primaryBranchId === options.branchId) && (!normalized || normalizeFamilySearch(person.displayName + " " + person.code + " " + person.names.map((name) => name.name).join(" ")).includes(normalized)));
  const shown = people.slice(0, normalized ? 20 : 5);
  return (
    <div className="family-chooser">
      <label htmlFor={id}>Tìm người trong gia phả</label>
      <input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên hoặc tên thường gọi" autoComplete="off" aria-describedby={`${id}-results`} />
      <p id={`${id}-results`} className="family-search-note" aria-live="polite">{normalized ? `${people.length} hồ sơ phù hợp${people.length > 20 ? "; đang hiện 20 hồ sơ đầu" : ""}.` : "Chọn một người dưới đây hoặc nhập tên để tìm."}</p>
      {shown.length ? <ul className="family-search-results">{shown.map((person) => <li key={person.id}>
        <button type="button" onClick={() => onChoose(person.id)}>
          <span><strong>{person.displayName}</strong><small>{person.yearLabel === "Chưa rõ" ? "Chưa rõ năm sinh" : `Sinh năm ${person.yearLabel}`} · {branchName(person.primaryBranchId)}</small></span>
          <span aria-hidden="true">→</span>
        </button>
      </li>)}</ul> : <p className="family-empty">Chưa tìm thấy người phù hợp. Thử tên ngắn hơn hoặc bỏ bộ lọc chi.</p>}
    </div>
  );
}

function FamilyOptions({ options, onChange }: { options: FamilyViewOptions; onChange: (options: FamilyViewOptions) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    if (options.rootId) params.set("root", options.rootId);
    params.set("mode", String(form.get("mode") ?? "family"));
    params.set("depth", String(form.get("depth") ?? 2));
    params.set("branch", String(form.get("branch") ?? ""));
    onChange({ ...readFamilyOptions(params, demoPeople, demoBranches.map((branch) => branch.id)), view: options.view });
    event.currentTarget.closest("details")?.removeAttribute("open");
  }
  return (
    <details className="family-options">
      <summary>Tùy chọn</summary>
      <form onSubmit={submit} key={`${options.mode}:${options.depth}:${options.branchId}`}>
        <label>Chi gia đình<select name="branch" defaultValue={options.branchId ?? ""}><option value="">Tất cả các chi</option>{demoBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Phạm vi sơ đồ<select name="mode" defaultValue={options.mode}><option value="family">Gia đình và họ hàng gần</option><option value="ancestors">Các thế hệ trước</option><option value="descendants">Các thế hệ sau</option></select></label>
        <label>Số thế hệ trong sơ đồ<select name="depth" defaultValue={options.depth}>{[1, 2, 3, 4, 5, 6].map((depth) => <option key={depth} value={depth}>{depth} thế hệ quanh người đang xem</option>)}</select></label>
        <button className="button-secondary" type="submit">Áp dụng</button>
      </form>
    </details>
  );
}

export function TreeExplorer({ rootId }: { rootId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const parsed = readFamilyOptions(params, demoPeople, demoBranches.map((branch) => branch.id));
  const options: FamilyViewOptions = { ...parsed, rootId: parsed.rootId ?? (!params.has("root") && rootId && demoPeople.some((person) => person.id === rootId) ? rootId : null) };
  const family = options.rootId ? getDemoFamilyView(options.rootId) : null;
  const [isDesktop, setIsDesktop] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const diagramButton = useRef<HTMLButtonElement>(null);
  const changePersonDetails = useRef<HTMLDetailsElement>(null);
  const familyHeading = useRef<HTMLHeadingElement>(null);
  const previousRoot = useRef(options.rootId);
  const diagramIsOpen = options.view === "diagram" && Boolean(family);
  const titleId = useId();
  const navigate = (next: FamilyViewOptions) => router.push(familyHref(next), { scroll: false });
  const closeDiagram = () => navigate({ ...options, view: "family" });

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = diagramButton.current;
    if (!dialog) return;
    if (diagramIsOpen && !dialog.open) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.showModal();
      return () => {
        if (dialog.open) dialog.close();
        document.body.style.overflow = previousOverflow;
        returnFocus?.focus({ preventScroll: true });
      };
    }
    if (!diagramIsOpen && dialog.open) dialog.close();
  }, [diagramIsOpen]);

  useEffect(() => {
    if (options.rootId && previousRoot.current !== options.rootId && !diagramIsOpen) familyHeading.current?.focus();
    previousRoot.current = options.rootId;
  }, [options.rootId, diagramIsOpen]);

  const diagramOptions = useMemo(() => ({ rootId: options.rootId, view: options.view, mode: options.mode, depth: options.depth, branchId: options.branchId }), [options.rootId, options.view, options.mode, options.depth, options.branchId]);
  const choose = (id: string) => {
    changePersonDetails.current?.removeAttribute("open");
    navigate({ ...options, rootId: id, view: "family" });
  };

  return (
    <div className="family-browser">
      {!family ? <section className="family-start" aria-labelledby={titleId}>
        <h1>Gia phả</h1>
        <h2 id={titleId}>Bạn muốn xem gia đình của ai?</h2>
        <p className="family-demo-note" role="note">Dữ liệu minh họa, tên và thông tin đều hư cấu.</p>
        {params.has("root") ? <p role="status">Chưa mở được hồ sơ này. Hãy chọn một người trong danh sách bạn được xem.</p> : null}
        <PersonChooser options={options} onChoose={choose} />
        <FamilyOptions options={options} onChange={navigate} />
      </section> : <section className="family-reading" aria-labelledby={titleId}>
        <header className="family-heading">
          <div><h1 id={titleId} ref={familyHeading} tabIndex={-1}>Gia đình của <span>{family.person.displayName}</span></h1><p className="family-demo-note" role="note">Dữ liệu minh họa, tên và thông tin đều hư cấu.</p></div>
          <div className="family-heading-actions"><button ref={diagramButton} className="button-primary" type="button" onClick={() => navigate({ ...options, view: "diagram" })}>Mở sơ đồ</button><FamilyOptions options={options} onChange={navigate} /></div>
        </header>
        <details className="family-change-person" ref={changePersonDetails}><summary>Tìm người khác</summary><PersonChooser options={options} onChoose={choose} /></details>
        {options.branchId ? <p className="family-filter-note">Đang xem {branchName(options.branchId)}. <button type="button" onClick={() => navigate({ ...options, branchId: null })}>Xem tất cả các chi</button></p> : null}
        <div className="family-reading-grid">
          <FamilyGroup title="Cha mẹ" members={family.parents} options={options} className="family-parents" />
          <section className="family-group family-center" aria-label="Người đang xem và vợ chồng hoặc bạn đời">
            <h2>Người đang xem</h2>
            <FamilyPersonRow person={family.person} options={options} current />
            <FamilyGroup title="Vợ, chồng hoặc bạn đời" members={family.partners} options={options} />
          </section>
          <FamilyGroup title="Con" members={family.children} options={options} className="family-children" />
        </div>
        {family.needsReview ? <p className="family-review-note">Một số quan hệ còn cần đối chiếu. Các quan hệ này được ghi rõ bên cạnh tên người liên quan.</p> : null}
      </section>}

      <dialog className="family-diagram-dialog" ref={dialogRef} aria-label={family ? `Sơ đồ gia đình của ${family.person.displayName}` : "Sơ đồ gia đình"} onCancel={(event) => { event.preventDefault(); closeDiagram(); }}>
        {diagramIsOpen && family ? <>
          <header className="family-diagram-header"><div><h2>Sơ đồ gia đình</h2><p>{family.person.displayName}</p></div><button className="button-secondary" type="button" onClick={closeDiagram} autoFocus>Đóng sơ đồ</button></header>
          <FamilyDiagram key={`${options.rootId}:${options.mode}:${options.depth}:${options.branchId}:${isDesktop}`} dataset={demoFamilyDataset} options={diagramOptions} maxNodes={isDesktop ? 300 : 120} onChoose={choose} onClose={closeDiagram} />
        </> : null}
      </dialog>
    </div>
  );
}
