"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function SearchBox({ initialValue = "", compact = false }: { initialValue?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();
    if (query.length > 0 && query.length < 2) {
      setMessage("Nhập ít nhất 2 ký tự hoặc mã hồ sơ đầy đủ.");
      return;
    }
    setMessage("");
    router.push(query ? `/tra-cuu?q=${encodeURIComponent(query)}` : "/tra-cuu");
  }

  return (
    <form className={`search-panel${compact ? " search-panel-compact" : ""}`} onSubmit={submit} role="search">
      <label htmlFor="family-search">Tìm trong dòng họ</label>
      <div className="search-row">
        <input
          id="family-search"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Tên người, chi họ, mã hồ sơ…"
          aria-describedby={message ? "family-search-message" : undefined}
        />
        <button className="button-primary" type="submit">Tìm</button>
      </div>
      {message ? <p className="field-error" id="family-search-message">{message}</p> : null}
    </form>
  );
}
