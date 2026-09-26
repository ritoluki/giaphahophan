"use client";

import Link from "next/link";
import { useState } from "react";
import type { DemoFamilyFocus, DemoPersonSummary } from "../../lib/demo-data";
import { branchName } from "../../lib/demo-data";

function PersonNode({ person, current = false }: { person: DemoPersonSummary; current?: boolean }) {
  return (
    <Link className={`person-node${current ? " person-node-current" : ""}`} href={`/nguoi/${person.id}`}>
      <span className="monogram" aria-hidden="true">{person.displayName.slice(0, 1)}</span>
      <span className="person-node-copy">
        <strong>{person.displayName}</strong>
        <small>{person.yearLabel} · {branchName(person.primaryBranchId)}</small>
      </span>
    </Link>
  );
}

function PersonList({ label, people }: { label: string; people: DemoPersonSummary[] }) {
  return (
    <section className="family-list" aria-labelledby={`${label}-title`}>
      <h3 id={`${label}-title`}>{label}</h3>
      {people.length ? <div className="family-list-items">{people.map((person) => <PersonNode person={person} key={person.id} />)}</div> : <p className="muted">Chưa xác định trong dữ liệu minh họa.</p>}
    </section>
  );
}

export function FamilyFocus({ family }: { family: DemoFamilyFocus }) {
  const [treeOpen, setTreeOpen] = useState(false);
  return (
    <section className="family-focus" aria-labelledby="family-focus-title">
      <div className="family-focus-header">
        <div>
          <p className="eyebrow">Chế độ mặc định · Gia đình gần</p>
          <h2 id="family-focus-title">Nhánh quanh người đang chọn</h2>
        </div>
        <button className="button-secondary" type="button" onClick={() => setTreeOpen((open) => !open)} aria-expanded={treeOpen}>
          {treeOpen ? "Đóng sơ đồ" : "Mở sơ đồ"}
        </button>
      </div>
      <div className="family-focus-current"><PersonNode person={family.person} current /></div>
      <div className="family-columns">
        <PersonList label="Cha mẹ" people={family.parents} />
        <PersonList label="Con" people={family.children} />
      </div>
      {treeOpen ? (
        <div className="family-tree-panel" role="group" aria-label="Sơ đồ gia đình minh họa">
          <div className="tree-column"><PersonList label="Thế hệ trước" people={family.parents} /></div>
          <div className="tree-connector" aria-hidden="true">↓</div>
          <div className="tree-column"><PersonNode person={family.person} current /></div>
          <div className="tree-connector" aria-hidden="true">↓</div>
          <div className="tree-column"><PersonList label="Thế hệ sau" people={family.children} /></div>
        </div>
      ) : null}
      <div className="legend" aria-label="Chú giải sơ đồ">
        <span><i className="legend-dot legend-dot-current" /> Người đang chọn</span>
        <span><i className="legend-dot" /> Quan hệ có nguồn</span>
        <span>Chưa xác định = không suy đoán</span>
      </div>
      {family.links.some((link) => link.status === "disputed") ? <p className="inline-warning">Có quan hệ đang được đánh dấu cần đối chiếu nguồn.</p> : null}
    </section>
  );
}
