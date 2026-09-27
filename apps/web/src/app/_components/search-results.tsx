"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { searchPeople } from "@phan/domain";
import type { DemoPersonSummary } from "../../lib/demo-data";
import { branchName } from "../../lib/demo-data";

export function SearchResults({ people, branches, initialQuery = "", initialBranchId = "", initialLifeStatus = "", initialBirthYear = "" }: { people: DemoPersonSummary[]; branches: Array<{ id: string; name: string }>; initialQuery?: string; initialBranchId?: string; initialLifeStatus?: string; initialBirthYear?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [branchId, setBranchId] = useState(initialBranchId);
  const [lifeStatus, setLifeStatus] = useState(initialLifeStatus);
  const [birthYear, setBirthYear] = useState(initialBirthYear);

  function replaceFilters(next: { branchId?: string; lifeStatus?: string; birthYear?: string }) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const nextBranchId = next.branchId ?? branchId;
    const nextLifeStatus = next.lifeStatus ?? lifeStatus;
    const nextBirthYear = next.birthYear ?? birthYear;
    if (nextBranchId) params.set("branchId", nextBranchId);
    if (nextLifeStatus) params.set("lifeStatus", nextLifeStatus);
    if (nextBirthYear) params.set("birthYear", nextBirthYear);
    router.replace(`/tra-cuu${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  const results = useMemo(() => searchPeople(people, query).filter((person) => {
    const matchesBranch = !branchId || person.primaryBranchId === branchId;
    const matchesLifeStatus = !lifeStatus || person.lifeStatus === lifeStatus;
    const matchesBirthYear = !birthYear || person.yearLabel === birthYear;
    return matchesBranch && matchesLifeStatus && matchesBirthYear;
  }), [birthYear, branchId, lifeStatus, people, query]);

  return (
    <section className="search-results" aria-labelledby="result-title">
      <div className="filter-row">
        <label htmlFor="result-query">Từ khóa</label>
        <input id="result-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tối thiểu 2 ký tự" />
        <label htmlFor="result-branch">Chi họ</label>
        <select id="result-branch" value={branchId} onChange={(event) => { const value = event.target.value; setBranchId(value); replaceFilters({ branchId: value }); }}>
          <option value="">Tất cả chi được phép xem</option>
          {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
        </select>
        <label htmlFor="result-life-status">Trạng thái</label>
        <select id="result-life-status" value={lifeStatus} onChange={(event) => { const value = event.target.value; setLifeStatus(value); replaceFilters({ lifeStatus: value }); }}>
          <option value="">Mọi trạng thái</option>
          <option value="deceased">Đã mất</option>
          <option value="living">Còn sống</option>
          <option value="unknown">Chưa rõ</option>
        </select>
        <label htmlFor="result-birth-year">Năm sinh</label>
        <input id="result-birth-year" inputMode="numeric" type="number" value={birthYear} onChange={(event) => { const value = event.target.value; setBirthYear(value); replaceFilters({ birthYear: value }); }} placeholder="Ví dụ 1900" />
      </div>
      <div className="section-heading result-heading">
        <h2 id="result-title">Kết quả tra cứu</h2>
        <span className="muted" aria-live="polite">{results.length} kết quả</span>
      </div>
      {query.trim().length < 2 ? (
        <div className="card empty-state"><h3>Bắt đầu bằng một tên hoặc mã hồ sơ</h3><p>Chỉ hiển thị người trong dữ liệu minh họa và phạm vi được phép xem.</p></div>
      ) : results.length === 0 ? (
        <div className="card empty-state"><h3>Chưa tìm thấy trong phạm vi bạn được xem</h3><p>Thử tên gọi khác hoặc điều chỉnh bộ lọc.</p></div>
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