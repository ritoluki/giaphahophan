"use client";

import type { Kinship } from "@phan/contracts";
import { useState, type FormEvent } from "react";
import { getDemoKinship, type DemoPersonSummary } from "../../lib/demo-data";

type KinshipFinderProps = { people: ReadonlyArray<DemoPersonSummary> };

const viaLabels: Record<NonNullable<Kinship["paths"][number][number]>["via"], string> = {
  start: "Điểm bắt đầu",
  parent: "cha/mẹ",
  child: "con",
  partner: "bạn đời",
  adoptive_parent: "cha/mẹ nuôi",
  adoptive_child: "con nuôi",
  guardian_parent: "người giám hộ",
  guardian_child: "người được giám hộ",
  step_parent: "cha/mẹ kế",
  step_child: "con riêng"
};

export function KinshipFinder({ people }: KinshipFinderProps) {
  const [fromId, setFromId] = useState(people[0]?.id ?? "");
  const [toId, setToId] = useState(people[1]?.id ?? people[0]?.id ?? "");
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

  return (
    <section className="kinship-finder" aria-labelledby="kinship-finder-title">
      <div className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">M05 · Đường quan hệ đã ghi nhận</p>
            <h2 id="kinship-finder-title">Chọn hai hồ sơ</h2>
          </div>
        </div>
        <form className="kinship-form" onSubmit={calculate}>
          <label>Người A<select value={fromId} onChange={(event) => setFromId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName} · {person.code}</option>)}</select></label>
          <label>Người B<select value={toId} onChange={(event) => setToId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName} · {person.code}</option>)}</select></label>
          <label className="kinship-check"><input type="checkbox" checked={includeAdoptive} onChange={(event) => setIncludeAdoptive(event.target.checked)} /> Bao gồm quan hệ nuôi đã xác nhận</label>
          <button className="button-primary" type="submit" disabled={isLoading || !fromId || !toId}>{isLoading ? "Đang tính đường…" : "Tính đường quan hệ"}</button>
        </form>
      </div>

      {hasError ? <div className="tree-state tree-state-error" role="alert"><strong>Không thể tính đường quan hệ</strong><p>Thử lại với hai hồ sơ khác. Dữ liệu không đủ quyền sẽ không được suy đoán.</p></div> : null}
      {!hasError && isLoading ? <div className="tree-state" role="status"><strong>Đang lọc graph theo quyền…</strong><p>Không tải dữ liệu ngoài phạm vi được phép xem.</p></div> : null}
      {!hasError && !isLoading && result?.status === "found" ? result.paths.map((path, index) => <article className="kinship-path card" key={path.map((step) => step.person.id).join("/")} aria-label={`Đường quan hệ ${index + 1}`}><h3>Đường {index + 1} · {path.length - 1} bước</h3><ol>{path.map((step) => <li key={`${step.person.id}-${step.via}`}><span className="kinship-step-via">{viaLabels[step.via]}</span><strong>{step.person.displayName}</strong><small>{step.person.code}</small></li>)}</ol></article>) : null}
      {result?.status === "found" && result.label ? <p className="muted kinship-label" role="note">Gợi ý mô tả: <strong>{result.label}</strong> · {result.labelConfidence === "reviewed_rule" ? "đủ dữ kiện theo rule" : "mô tả trung tính, chưa phải cách xưng hô chắc chắn"}</p> : null}
      {!hasError && !isLoading && result?.status === "not_found_within_visible_graph" ? <div className="tree-state" role="status"><strong>Chưa tìm thấy đường trong phạm vi được phép</strong><p>Điều này không kết luận hai người không có quan hệ; có thể đường chưa được ghi nhận hoặc bị giới hạn quyền xem.</p></div> : null}
      {!hasError && !isLoading && result?.status === "limit_reached" ? <div className="tree-state" role="status"><strong>Đường vượt giới hạn tìm kiếm</strong><p>Hệ thống không kết luận “không có quan hệ” khi đã chạm giới hạn an toàn.</p></div> : null}
      {!hasError && !isLoading && !result ? <div className="tree-state" role="status"><strong>Chưa tính đường</strong><p>Chọn Người A và Người B để xem từng bước đã được ghi nhận.</p></div> : null}
      {result?.status === "found" ? <p className="muted kinship-disclaimer" role="note">Kết quả mô tả đường dữ liệu, không tự suy ra cách xưng hô. {personName(fromId)} và {personName(toId)} vẫn cần nguồn/đối chiếu khi có tranh chấp.</p> : null}
    </section>
  );
}