"use client";

import Link from "next/link";
import { useState } from "react";

import type { DemoPersonRecord, DemoSource } from "../../lib/demo-data";
import { branchName } from "../../lib/demo-data";
import type { FamilyMember, FamilyView } from "../../lib/family-view-model";
import { datePrecisionLabel, lifeStatusLabels, sourceKindLabel } from "../../lib/ui-labels";

type ProfileState = "ready" | "loading" | "error" | "restricted";

type PersonProfileProps = {
  person: DemoPersonRecord;
  family: FamilyView | null;
  sources: DemoSource[];
  treeId: string;
  version: number;
  state?: ProfileState;
};

function EmptyPanel({ message }: { message: string }) {
  return <p className="empty-state">{message}</p>;
}

function StatePanel({ state }: { state: Exclude<ProfileState, "ready"> }) {
  if (state === "loading") {
    return <div className="card profile-state-panel" aria-busy="true"><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /><p className="muted">Đang tải hồ sơ…</p></div>;
  }
  if (state === "restricted") {
    return <div className="restricted-card profile-state-panel"><strong>Bạn chưa có quyền xem hồ sơ này</strong><p>Đăng nhập bằng tài khoản đã được mời vào gia phả để tiếp tục.</p><Link className="button-secondary" href="/dang-nhap">Đăng nhập</Link></div>;
  }
  return <div className="restricted-card profile-state-panel"><strong>Không tải được hồ sơ</strong><p>Hãy tải lại trang. Nếu vẫn gặp lỗi, liên hệ người phụ trách gia phả.</p><button className="button-secondary" type="button" onClick={() => window.location.reload()}>Thử lại</button></div>;
}

function OverviewPanel({ person }: { person: DemoPersonRecord }) {
  const yearLabel = person.birth?.year ? String(person.birth.year) : "Chưa rõ";
  return (
    <div className="profile-grid">
      <section className="card">
        <h2>Thông tin đã ghi nhận</h2>
        <dl className="detail-list">
          <div><dt>Mã hồ sơ</dt><dd>{person.externalId}</dd></div>
          <div><dt>Tình trạng</dt><dd>{person.lifeStatus === "living" || person.lifeStatus === "deceased" ? lifeStatusLabels[person.lifeStatus] : lifeStatusLabels.unknown}</dd></div>
          <div><dt>Năm sinh</dt><dd>{yearLabel}</dd></div>
          <div><dt>Chi họ</dt><dd>{branchName(person.branchId)}</dd></div>
          <div><dt>Ai được xem</dt><dd>{person.visibility === "members" ? "Thành viên gia phả" : person.visibility === "public" ? "Mọi người" : "Người được cấp quyền"}</dd></div>
        </dl>
      </section>
      <section className="card">
        <h2>Tên gọi</h2>
        <ul className="profile-name-list">
          {person.names.map((name, index) => <li key={name.kind + "-" + name.name + "-" + index}><span>{name.name}</span><small>{name.isPreferred ? "Tên thường dùng" : "Tên gọi khác"}</small></li>)}
        </ul>
      </section>
      <section className="card profile-span">
        <h2>Tiểu sử</h2>
        <p>{person.biography || "Chưa có nội dung tiểu sử được duyệt."}</p>
      </section>
    </div>
  );
}

function FamilyMemberList({ members }: { members: FamilyMember[] }) {
  if (members.length === 0) return <p className="muted">Chưa có thông tin.</p>;
  return <div className="family-list-items">{members.map(({ person, relationshipLabels }) => <article className="person-node" key={person.id}>
    <span className="person-node-copy"><strong>{person.displayName}</strong><small>{relationshipLabels.join(" · ")}{person.yearLabel && person.yearLabel !== "Chưa rõ" ? ` · Sinh năm ${person.yearLabel}` : ""}</small><span className="person-links"><Link href={"/gia-pha?root=" + person.id}>Xem gia đình</Link><Link href={"/nguoi/" + person.id}>Xem hồ sơ</Link></span></span>
  </article>)}</div>;
}

function FamilyPanel({ family }: { family: FamilyView | null }) {
  if (!family) return <EmptyPanel message="Chưa có thông tin gia đình." />;
  return (
    <div className="profile-grid profile-family-grid">
      <section className="card">
        <h3>Cha mẹ</h3>
        <FamilyMemberList members={family.parents} />
      </section>
      <section className="card">
        <h3>Vợ, chồng hoặc bạn đời</h3>
        <FamilyMemberList members={family.partners} />
      </section>
      <section className="card profile-span">
        <h3>Con</h3>
        <FamilyMemberList members={family.children} />
      </section>
    </div>
  );
}

function TimelinePanel({ person }: { person: DemoPersonRecord }) {
  if (!person.birth) return <EmptyPanel message="Chưa có mốc thời gian nào được ghi nhận." />;
  return (
    <section className="timeline profile-timeline" aria-label="Dòng thời gian hồ sơ">
      <article className="timeline-item">
        <div className="timeline-marker" aria-hidden="true" />
        <div className="card">
          <h3>Thông tin sinh</h3>
          <p>Thông tin gốc: {person.birth.originalText}</p>
          <span className="status-label">{datePrecisionLabel(person.birth.precision)}</span>
        </div>
      </article>
    </section>
  );
}

function SourcesPanel({ sources }: { sources: DemoSource[] }) {
  if (sources.length === 0) return <EmptyPanel message="Chưa có nguồn được liên kết với hồ sơ." />;
  return <div className="source-list">{sources.map((source) => <article className="card source-card" key={source.id}><h3>{source.title}</h3><p>{sourceKindLabel(source.kind)} · {source.provenance}</p><span className="status-label">Nguồn minh họa</span></article>)}</div>;
}

function MediaPanel() {
  return <EmptyPanel message="Chưa có ảnh được chia sẻ cho hồ sơ này." />;
}

type ImpactState = "idle" | "loading" | "ready" | "restricted" | "error" | "submitted";

type DeletionImpact = {
  version: number;
  edgeCount: number;
  factCount: number;
  sourceCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function DeletionImpactPanel({ personId, treeId, version }: { personId: string; treeId: string; version: number }) {
  const [impactState, setImpactState] = useState<ImpactState>("idle");
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [reason, setReason] = useState("");

  async function previewImpact() {
    setImpactState("loading");
    try {
      const response = await fetch("/api/v1/people/" + personId + "/deletion-impact", { cache: "no-store" });
      const body: unknown = await response.json();
      if (response.status === 401 || response.status === 403) {
        setImpactState("restricted");
        return;
      }
      if (!response.ok || !isRecord(body) || !isRecord(body.data)) {
        setImpactState("error");
        return;
      }
      const data = body.data;
      if (
        typeof data.version !== "number"
        || typeof data.edgeCount !== "number"
        || typeof data.factCount !== "number"
        || typeof data.sourceCount !== "number"
      ) {
        setImpactState("error");
        return;
      }
      setImpact({ version: data.version, edgeCount: data.edgeCount, factCount: data.factCount, sourceCount: data.sourceCount });
      setImpactState("ready");
    } catch {
      setImpactState("error");
    }
  }

  async function submitDeletion() {
    if (!impact || reason.trim().length === 0) return;
    setImpactState("loading");
    try {
      const response = await fetch("/api/v1/people/" + personId, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match": "\"" + impact.version + "\""
        },
        body: JSON.stringify({ treeId, reason: reason.trim() })
      });
      if (response.status === 401 || response.status === 403) {
        setImpactState("restricted");
        return;
      }
      if (response.status === 202) {
        setImpactState("submitted");
        return;
      }
      setImpactState("error");
    } catch {
      setImpactState("error");
    }
  }

  return (
    <section className="card profile-span deletion-impact-card" aria-labelledby="deletion-impact-title">
      <h3 id="deletion-impact-title">Đề nghị ẩn hồ sơ</h3>
      <p>Hồ sơ và các quan hệ liên quan chỉ được ẩn sau khi yêu cầu được duyệt. Thông tin và tư liệu gốc vẫn được lưu để đối chiếu; đây chưa phải yêu cầu xóa vĩnh viễn.</p>
      {impactState === "idle" ? <button className="button-secondary" type="button" onClick={() => void previewImpact()}>Xem tác động trước khi gửi</button> : null}
      {impactState === "loading" ? <p className="muted" aria-live="polite">Đang kiểm tra tác động…</p> : null}
      {impactState === "restricted" ? <div className="restricted-card"><strong>Bạn chưa có quyền gửi yêu cầu này</strong><p>Hãy liên hệ người phụ trách gia phả nếu cần ẩn thông tin.</p></div> : null}
      {impactState === "error" ? <div className="restricted-card"><strong>Không tải được tác động</strong><p>Hãy thử lại; dữ liệu vẫn chưa thay đổi.</p><button className="button-secondary" type="button" onClick={() => void previewImpact()}>Thử lại</button></div> : null}
      {impactState === "ready" && impact ? (
        <div className="deletion-impact-summary">
          <p aria-live="polite">Hồ sơ đang có {impact.edgeCount} quan hệ, {impact.factCount} thông tin được ghi nhận và {impact.sourceCount} nguồn tư liệu liên quan.</p>
          <label className="field-label" htmlFor="deletion-reason">Lý do yêu cầu</label>
          <textarea id="deletion-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={4000} />
          <button className="button-danger" type="button" disabled={reason.trim().length === 0} onClick={() => void submitDeletion()}>Gửi yêu cầu ẩn hồ sơ</button>
        </div>
      ) : null}
      {impactState === "submitted" ? <div className="status-label" aria-live="polite">Đã gửi yêu cầu, đang chờ người khác duyệt. Hồ sơ chưa bị ẩn.</div> : null}
      {impactState === "idle" && version < 1 ? <p className="muted">Phiên bản hồ sơ chưa sẵn sàng.</p> : null}
    </section>
  );
}

export function PersonProfile({ person, family, sources, treeId, version, state = "ready" }: PersonProfileProps) {
  if (state !== "ready") return <StatePanel state={state} />;

  return (
    <section className="profile-sections" aria-label="Thông tin hồ sơ">
      <section className="profile-section" aria-labelledby="profile-family-title"><h2 id="profile-family-title">Gia đình</h2><FamilyPanel family={family} /></section>
      <OverviewPanel person={person} />
      <details className="profile-more"><summary>Dòng thời gian</summary><TimelinePanel person={person} /></details>
      <details className="profile-more"><summary>Nguồn tư liệu ({sources.length})</summary><SourcesPanel sources={sources} /></details>
      <details className="profile-more"><summary>Ảnh của hồ sơ</summary><MediaPanel /></details>
      <details className="profile-more"><summary>Liên kết tài khoản hoặc đề nghị ẩn hồ sơ</summary>
        <div className="profile-state-panel"><h3>Đây là hồ sơ của bạn?</h3><p>Đăng nhập để đề nghị liên kết tài khoản. Việc liên kết chỉ có hiệu lực sau khi người khác duyệt.</p><Link className="button-secondary" href="/dang-nhap">Đăng nhập để đề nghị</Link></div>
        <DeletionImpactPanel personId={person.id} treeId={treeId} version={version} />
      </details>
    </section>
  );
}
