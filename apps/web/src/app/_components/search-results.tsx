"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { searchPeople } from "@phan/domain";
import type { DemoPersonSummary } from "../../lib/demo-data";
import { branchName } from "../../lib/demo-data";

export function SearchResults({ people, branches, initialQuery = "" }: { people: DemoPersonSummary[]; branches: Array<{ id: string; name: string }>; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [branchId, setBranchId] = useState("");
  const results = useMemo(() => searchPeople(people, query).filter((person) => !branchId || person.primaryBranchId === branchId), [branchId, people, query]);

  return (
    <section className="search-results" aria-labelledby="result-title">
      <div className="filter-row">
        <label htmlFor="result-query">Từ khóa</label>
        <input id="result-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tối thiểu 2 ký tự" />
        <label htmlFor="result-branch">Chi họ</label>
        <select id="result-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">Tất cả chi được phép xem</option>
          {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
        </select>
      </div>
      <div className="section-heading result-heading">
        <h2 id="result-title">Kết quả tra cứu</h2>
        <span className="muted" aria-live="polite">{results.length} kết quả</span>
      </div>
      {query.trim().length < 2 ? (
        <div className="card empty-state"><h3>Bắt đầu bằng một tên hoặc mã hồ sơ</h3><p>Chỉ hiển thị người trong dữ liệu minh họa và phạm vi được phép xem.</p></div>
      ) : results.length === 0 ? (
        <div className="card empty-state"><h3>Chưa tìm thấy trong phạm vi bạn được xem</h3><p>Thử tên gọi khác hoặc chọn lại chi họ.</p></div>
      ) : (
        <div className="result-list">
          {results.map((person) => (
            <Link className="card person-result" href={`/nguoi/${person.id}`} key={person.id}>
              <span className="monogram" aria-hidden="true">{person.displayName.slice(0, 1)}</span>
              <span>
                <strong>{person.displayName}</strong>
                <small>{person.code} · {branchName(person.primaryBranchId ?? null)} · {person.yearLabel}</small>
                {person.matchedNames.length > 0 ? <small>Tên khác: {person.matchedNames.map((name) => name.name).join(", ")}</small> : null}
              </span>
              <span className="result-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}