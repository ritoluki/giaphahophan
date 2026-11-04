"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PersonSearchResult } from "@phan/contracts";
import { searchPeople } from "@phan/domain";
import { fetchPersonSearch, createLatestSearchRequestCoordinator } from "../../lib/search-request";
import { emptyPersonSearchFilters, personSearchHref, readPersonSearchState, validSearchBirthYear, type PersonSearchFilters, type PersonSearchState } from "../../lib/search-state";
import type { DemoPersonSummary } from "../../lib/demo-data";
import { branchName } from "../../lib/demo-data";

type RemoteSearchState = { key: string; results: PersonSearchResult[]; status: "loading" | "ready" | "error" };

export function SearchResults({ people, branches, remoteSearch = false }: { people: DemoPersonSummary[]; branches: Array<{ id: string; name: string }>; remoteSearch?: boolean }) {
  // Native history integrates with useSearchParams in this Next version. The URL is
  // the source of truth for reload and Back without remounting the search field.
  const searchParams = useSearchParams();
  const { query, branchId, lifeStatus, birthYear } = readPersonSearchState(searchParams);
  const [draftFilters, setDraftFilters] = useState<PersonSearchFilters>({ branchId, lifeStatus, birthYear });
  const [filterError, setFilterError] = useState("");
  const [remoteState, setRemoteState] = useState<RemoteSearchState>({ key: "", results: [], status: "ready" });
  const [retryNonce, setRetryNonce] = useState(0);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const requestCoordinator = useRef(createLatestSearchRequestCoordinator());
  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length >= 2;
  const searchKey = personSearchHref({ query: normalizedQuery, branchId, lifeStatus, birthYear });
  const activeFilterCount = [branchId, lifeStatus, birthYear].filter(Boolean).length;

  function writeSearch(next: PersonSearchState, history: "push" | "replace") {
    const href = personSearchHref(next);
    if (href === window.location.pathname + window.location.search) return;
    if (history === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  }

  function closeFilters() {
    if (detailsRef.current) detailsRef.current.open = false;
    summaryRef.current?.focus();
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validSearchBirthYear(draftFilters.birthYear)) {
      setFilterError("Nhập năm sinh là số nguyên từ −5000 đến 5000, hoặc để trống.");
      return;
    }
    writeSearch({ ...readPersonSearchState(new URLSearchParams(window.location.search)), ...draftFilters }, "push");
    setFilterError("");
    closeFilters();
  }

  function clearFilters() {
    setDraftFilters(emptyPersonSearchFilters);
    setFilterError("");
    writeSearch({ ...readPersonSearchState(new URLSearchParams(window.location.search)), ...emptyPersonSearchFilters }, "push");
    closeFilters();
  }

  useEffect(() => {
    const coordinator = requestCoordinator.current;
    if (!remoteSearch || !hasQuery) {
      coordinator.cancel();
      return;
    }

    const request = coordinator.begin();
    const timer = window.setTimeout(() => {
      if (!request.isCurrent()) return;
      setRemoteState({ key: searchKey, results: [], status: "loading" });
      void fetchPersonSearch({ query: normalizedQuery, branchId, lifeStatus, birthYear }, request.signal)
        .then((nextResults) => {
          if (request.isCurrent()) setRemoteState({ key: searchKey, results: nextResults, status: "ready" });
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
          if (request.isCurrent()) setRemoteState({ key: searchKey, results: [], status: "error" });
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      coordinator.cancel();
    };
  }, [birthYear, branchId, hasQuery, lifeStatus, normalizedQuery, remoteSearch, retryNonce, searchKey]);

  const localResults = useMemo(() => searchPeople(people, query).filter((person) => {
    const matchesBranch = !branchId || person.primaryBranchId === branchId;
    const matchesLifeStatus = !lifeStatus || person.lifeStatus === lifeStatus;
    const matchesBirthYear = !birthYear || person.yearLabel === birthYear;
    return matchesBranch && matchesLifeStatus && matchesBirthYear;
  }), [birthYear, branchId, lifeStatus, people, query]);
  const remoteLoading = remoteSearch && hasQuery && (remoteState.key !== searchKey || remoteState.status === "loading");
  const remoteError = remoteSearch && remoteState.key === searchKey && remoteState.status === "error";
  const results = remoteSearch ? remoteState.key === searchKey && remoteState.status === "ready" ? remoteState.results : [] : localResults;

  return (
    <section className="search-results" aria-labelledby="result-title">
      <div className="search-input-row">
        <label htmlFor="result-query">Tìm người</label>
        <input id="result-query" type="search" autoComplete="off" maxLength={200} value={query} onChange={(event) => writeSearch({ ...readPersonSearchState(new URLSearchParams(window.location.search)), query: event.target.value }, "replace")} placeholder="Tên, tên gọi khác hoặc mã hồ sơ" aria-describedby="result-query-help" />
        <small id="result-query-help">Nhập ít nhất 2 ký tự. Có thể gõ không dấu.</small>
      </div>
      <details className="search-filters" ref={detailsRef} onToggle={(event) => {
        if (event.currentTarget.open) {
          setDraftFilters({ branchId, lifeStatus, birthYear });
          setFilterError("");
        }
      }}>
        <summary ref={summaryRef}>Bộ lọc{activeFilterCount ? <span className="muted"> · {activeFilterCount} đang dùng</span> : null}</summary>
        <form className="search-filter-form" onSubmit={applyFilters} noValidate>
          <div className="search-filter-fields">
            <label htmlFor="result-branch">Chi họ
              <select id="result-branch" value={draftFilters.branchId} onChange={(event) => setDraftFilters((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">Tất cả các chi</option>
                {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label htmlFor="result-life-status">Tình trạng
              <select id="result-life-status" value={draftFilters.lifeStatus} onChange={(event) => {
                const value = event.target.value;
                if (value === "" || value === "living" || value === "deceased" || value === "unknown") setDraftFilters((current) => ({ ...current, lifeStatus: value }));
              }}>
                <option value="">Tất cả</option>
                <option value="deceased">Đã mất</option>
                <option value="living">Còn sống</option>
                <option value="unknown">Chưa rõ</option>
              </select>
            </label>
            <label htmlFor="result-birth-year">Năm sinh
              <input id="result-birth-year" inputMode="numeric" type="text" maxLength={6} value={draftFilters.birthYear} onChange={(event) => setDraftFilters((current) => ({ ...current, birthYear: event.target.value }))} placeholder="Ví dụ: 1900" aria-invalid={filterError ? true : undefined} aria-describedby={filterError ? "result-filter-error" : undefined} />
            </label>
          </div>
          {filterError ? <p id="result-filter-error" className="field-error" role="alert">{filterError}</p> : null}
          <div className="search-filter-actions"><button className="button-primary" type="submit">Áp dụng</button><button className="button-secondary" type="button" onClick={clearFilters}>Xóa bộ lọc</button></div>
        </form>
      </details>
      <div className="section-heading result-heading">
        <h2 id="result-title">Kết quả tra cứu</h2>
        <span className="muted" aria-live="polite">{remoteLoading ? "Đang tìm…" : hasQuery && !remoteError ? `${results.length} người` : ""}</span>
      </div>
      {!hasQuery ? (
        <div className="empty-state"><h3>Bạn muốn tìm ai?</h3><p>Nhập tên hoặc tên gọi khác của người thân vào ô tìm kiếm.</p></div>
      ) : remoteLoading ? (
        <div className="empty-state" role="status"><h3>Đang tìm người…</h3><p>Vui lòng chờ trong giây lát.</p></div>
      ) : remoteError ? (
        <div className="empty-state" role="alert"><h3>Chưa tải được kết quả</h3><p>Hãy kiểm tra kết nối rồi thử lại.</p><button className="button-secondary" type="button" onClick={() => setRetryNonce((value) => value + 1)}>Thử lại</button></div>
      ) : results.length === 0 ? (
        <div className="empty-state"><h3>Chưa tìm thấy người phù hợp</h3><p>Thử tên gọi khác hoặc bớt bộ lọc. Một số thông tin có thể chưa được chia sẻ với bạn.</p></div>
      ) : (
        <div className="result-list">
          {results.map((person) => (
            <Link className="person-result" href={`/nguoi/${person.id}`} key={person.id}>
              <span className="monogram" aria-hidden="true">{person.displayName.slice(0, 1)}</span>
              <span className="person-result-copy">
                <strong>{person.displayName}</strong>
                <small>{branchName(person.primaryBranchId ?? null)} · {person.yearLabel && /^-?\d+$/.test(person.yearLabel) ? `Sinh năm ${person.yearLabel}` : "Chưa rõ năm sinh"}</small>
                <small>{person.code}</small>
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
