"use client";

import Link from "next/link";
import { useState } from "react";

import type { DemoFamilyFocus, DemoPersonRecord, DemoSource } from "../../lib/demo-data";
import { branchName } from "../../lib/demo-data";

type ProfileState = "ready" | "loading" | "error" | "restricted";

type PersonProfileProps = {
  person: DemoPersonRecord;
  family: DemoFamilyFocus | null;
  sources: DemoSource[];
  state?: ProfileState;
};

const tabs = [
  { id: "overview", label: "Tổng quan" },
  { id: "family", label: "Gia đình" },
  { id: "timeline", label: "Dòng thời gian" },
  { id: "sources", label: "Nguồn" },
  { id: "media", label: "Tư liệu ảnh" }
] as const;

type TabId = (typeof tabs)[number]["id"];

function EmptyPanel({ message }: { message: string }) {
  return <div className="card empty-state"><p>{message}</p></div>;
}

function StatePanel({ state }: { state: Exclude<ProfileState, "ready"> }) {
  if (state === "loading") {
    return <div className="card profile-state-panel" aria-busy="true"><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /><p className="muted">Đang tải hồ sơ…</p></div>;
  }
  if (state === "restricted") {
    return <div className="restricted-card profile-state-panel"><strong>Hồ sơ được giới hạn</strong><p>Thông tin này chỉ hiển thị khi phiên có quyền phù hợp.</p><Link className="button-secondary" href="/dang-nhap">Đăng nhập</Link></div>;
  }
  return <div className="restricted-card profile-state-panel"><strong>Không tải được hồ sơ</strong><p>Hãy thử lại để tải projection đã được kiểm tra quyền.</p><Link className="button-secondary" href="./">Thử lại</Link></div>;
}

function OverviewPanel({ person }: { person: DemoPersonRecord }) {
  const aliases = person.names.filter((name) => !name.isPreferred);
  const yearLabel = person.birth?.year ? String(person.birth.year) : "Chưa rõ";
  return (
    <div className="profile-grid">
      <section className="card">
        <h2>Thông tin đã ghi nhận</h2>
        <dl className="detail-list">
          <div><dt>Mã hồ sơ</dt><dd>{person.externalId}</dd></div>
          <div><dt>Trạng thái</dt><dd>{person.lifeStatus === "deceased" ? "Đã qua đời · demo" : "Chưa xác định · demo"}</dd></div>
          <div><dt>Năm sinh</dt><dd>{yearLabel}</dd></div>
          <div><dt>Chi họ</dt><dd>{branchName(person.branchId)}</dd></div>
          <div><dt>Hiển thị</dt><dd>{person.visibility === "members" ? "Thành viên · bản minh họa" : "Công khai · bản minh họa"}</dd></div>
        </dl>
      </section>
      <section className="card">
        <h2>Tên và bí danh</h2>
        <ul className="profile-name-list">
          {person.names.map((name, index) => <li key={name.kind + "-" + name.name + "-" + index}><span>{name.name}</span><small>{name.isPreferred ? "Tên ưu tiên" : "Bí danh"}</small></li>)}
        </ul>
        {aliases.length === 0 ? <p className="source-note">Chưa có bí danh được ghi nhận.</p> : null}
      </section>
      <section className="card profile-span">
        <h2>Tiểu sử</h2>
        <p>{person.biography || "Chưa có nội dung tiểu sử được duyệt."}</p>
      </section>
      <div className="restricted-card profile-span">
        <strong>Muốn liên kết tài khoản với hồ sơ này?</strong>
        <p>Đăng nhập để gửi đề nghị. Việc liên kết chỉ có hiệu lực sau khi người khác duyệt.</p>
        <Link className="button-secondary" href="/dang-nhap">Đăng nhập để đề nghị</Link>
      </div>
    </div>
  );
}

function FamilyPanel({ family }: { family: DemoFamilyFocus | null }) {
  if (!family || (family.parents.length === 0 && family.children.length === 0)) {
    return <EmptyPanel message="Chưa có quan hệ gia đình được ghi nhận trong bản minh họa này." />;
  }
  return (
    <div className="profile-grid">
      <section className="card">
        <h2>Cha mẹ</h2>
        {family.parents.length === 0 ? <p className="muted">Chưa có dữ liệu.</p> : <div className="family-list-items">{family.parents.map((parent) => <Link className="person-node" href={"/nguoi/" + parent.id} key={parent.id}><span className="monogram" aria-hidden="true">{parent.displayName.slice(0, 1)}</span><span className="person-node-copy"><strong>{parent.displayName}</strong><small>{parent.code}</small></span></Link>)}</div>}
      </section>
      <section className="card">
        <h2>Con cháu</h2>
        {family.children.length === 0 ? <p className="muted">Chưa có dữ liệu.</p> : <div className="family-list-items">{family.children.map((child) => <Link className="person-node" href={"/nguoi/" + child.id} key={child.id}><span className="monogram" aria-hidden="true">{child.displayName.slice(0, 1)}</span><span className="person-node-copy"><strong>{child.displayName}</strong><small>{child.code}</small></span></Link>)}</div>}
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
          <h2>Sinh năm {person.birth.year ?? "chưa rõ"}</h2>
          <p>{person.birth.originalText} · độ chính xác: {person.birth.precision}</p>
          <span className="status-label">Bản minh họa · cần đối chiếu nguồn</span>
        </div>
      </article>
    </section>
  );
}

function SourcesPanel({ sources }: { sources: DemoSource[] }) {
  if (sources.length === 0) return <EmptyPanel message="Chưa có nguồn được liên kết với hồ sơ." />;
  return <div className="source-list">{sources.map((source) => <article className="card source-card" key={source.id}><span className="source-kind">{source.kind}</span><h2>{source.title}</h2><p>{source.provenance}</p><span className="status-label">Nguồn minh họa</span></article>)}</div>;
}

function MediaPanel() {
  return <div className="restricted-card profile-state-panel"><strong>Chưa có tư liệu ảnh</strong><p>Ảnh và media chỉ xuất hiện sau khi được tải lên, quét an toàn và cấp quyền.</p></div>;
}

export function PersonProfile({ person, family, sources, state = "ready" }: PersonProfileProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  if (state !== "ready") return <StatePanel state={state} />;

  return (
    <section className="profile-tabs-shell" aria-label="Các lớp hồ sơ">
      <div className="profile-tabs" role="tablist" aria-label="Hồ sơ người">
        {tabs.map((tab) => <button className={activeTab === tab.id ? "profile-tab profile-tab-active" : "profile-tab"} key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={"profile-panel-" + tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </div>
      <div id={"profile-panel-" + activeTab} role="tabpanel" tabIndex={0} className="profile-tab-panel">
        {activeTab === "overview" ? <OverviewPanel person={person} /> : null}
        {activeTab === "family" ? <FamilyPanel family={family} /> : null}
        {activeTab === "timeline" ? <TimelinePanel person={person} /> : null}
        {activeTab === "sources" ? <SourcesPanel sources={sources} /> : null}
        {activeTab === "media" ? <MediaPanel /> : null}
      </div>
    </section>
  );
}
