"use client";

import type { Kinship } from "@phan/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { branchName, getDemoKinship, type DemoPersonSummary } from "../../lib/demo-data";

type KinshipFinderProps = { people: ReadonlyArray<DemoPersonSummary>; initialFromId?: string | undefined };

const viaLabels: Record<NonNullable<Kinship["paths"][number][number]>["via"], string> = {
  start: "Người thứ nhất",
  parent: "Cha hoặc mẹ của người phía trên",
  child: "Con của người phía trên",
  partner: "Vợ, chồng hoặc bạn đời của người phía trên",
  adoptive_parent: "Cha hoặc mẹ nuôi của người phía trên",
  adoptive_child: "Con nuôi của người phía trên",
  guardian_parent: "Người giám hộ của người phía trên",
  guardian_child: "Người được người phía trên giám hộ",
  step_parent: "Cha dượng hoặc mẹ kế của người phía trên",
  step_child: "Con riêng của vợ hoặc chồng người phía trên"
};

export function KinshipFinder({ people, initialFromId }: KinshipFinderProps) {
  const startingPersonId = people.find((person) => person.id === initialFromId)?.id ?? people[0]?.id ?? "";
  const [fromId, setFromId] = useState(startingPersonId);
  const [toId, setToId] = useState(people.find((person) => person.id !== startingPersonId)?.id ?? startingPersonId);
  const [includeAdoptive, setIncludeAdoptive] = useState(true);
  const [result, setResult] = useState<Kinship | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const personName = (id: string) => people.find((person) => person.id === id)?.displayName ?? "Hồ sơ đã chọn";
  const calculate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setHasError(false);
    setResult(null);
    try {
      await Promise.resolve();
      setResult(getDemoKinship(fromId, toId, includeAdoptive));
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (people.length === 0) return <div className="empty-state"><h2>Chưa có người để chọn</h2><p>Những hồ sơ được chia sẻ với bạn sẽ xuất hiện ở đây.</p></div>;

  return (
    <section className="kinship-finder" aria-labelledby="kinship-finder-title">
      <div className="card">
        <div className="section-heading">
          <div>
            <h2 id="kinship-finder-title">Chọn hai người</h2>
          </div>
        </div>
        <form className="kinship-form" onSubmit={calculate}>
          <label>Người thứ nhất<select value={fromId} onChange={(event) => { setFromId(event.target.value); setResult(null); }}>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName} · {person.yearLabel} · {branchName(person.primaryBranchId)}</option>)}</select></label>
          <label>Người thứ hai<select value={toId} onChange={(event) => { setToId(event.target.value); setResult(null); }}>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName} · {person.yearLabel} · {branchName(person.primaryBranchId)}</option>)}</select></label>
          <label className="kinship-check"><input type="checkbox" checked={includeAdoptive} onChange={(event) => { setIncludeAdoptive(event.target.checked); setResult(null); }} /> Bao gồm quan hệ nuôi đã xác nhận</label>
          <button className="button-primary" type="submit" disabled={isLoading || !fromId || !toId}>{isLoading ? "Đang tìm quan hệ…" : "Xem quan hệ"}</button>
        </form>
      </div>

      {hasError ? <div className="tree-state tree-state-error" role="alert"><strong>Chưa thể tìm quan hệ</strong><p>Hãy thử lại sau hoặc chọn hai người khác.</p></div> : null}
      {!hasError && isLoading ? <div className="tree-state" role="status"><strong>Đang tìm quan hệ giữa hai người…</strong></div> : null}
      {!hasError && !isLoading && result?.status === "found" ? result.paths.map((path, index) => <article className="kinship-path card" key={path.map((step) => step.person.id).join("/")} aria-label={`Mối liên hệ ${index + 1}`}><h3>{path.length === 1 ? "Bạn đang chọn cùng một người" : result.paths.length > 1 ? `Mối liên hệ ${index + 1}` : "Mối liên hệ đã ghi nhận"}</h3><ol>{path.map((step) => <li key={`${step.person.id}-${step.via}`}><span className="kinship-step-via">{viaLabels[step.via]}</span><strong>{step.person.displayName}</strong><small><Link href={"/nguoi/" + step.person.id}>Xem hồ sơ</Link></small></li>)}</ol></article>) : null}
      {!hasError && !isLoading && result?.status === "not_found_within_visible_graph" ? <div className="tree-state" role="status"><strong>Chưa tìm thấy mối liên hệ</strong><p>Có thể gia phả chưa ghi nhận đủ thông tin hoặc một phần thông tin chưa được chia sẻ với bạn. Kết quả này không có nghĩa hai người không có quan hệ.</p></div> : null}
      {!hasError && !isLoading && result?.status === "limit_reached" ? <div className="tree-state" role="status"><strong>Chưa thể tìm hết mối liên hệ</strong><p>Hai người có thể cách nhau nhiều thế hệ. Hãy thử chọn một người gần hơn trong cùng nhánh gia đình.</p></div> : null}
      {!hasError && !isLoading && !result ? <div className="tree-state" role="status"><strong>Quan hệ sẽ hiện ở đây</strong><p>Chọn hai người rồi nhấn “Xem quan hệ”.</p></div> : null}
      {result?.status === "found" ? <p className="muted kinship-disclaimer" role="note">Đây là các quan hệ đã được ghi nhận giữa {personName(fromId)} và {personName(toId)}. Cách xưng hô cụ thể còn tùy thứ bậc và tập quán của gia đình.</p> : null}
    </section>
  );
}
