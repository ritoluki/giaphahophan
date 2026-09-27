import type { Fund, Journal } from "@phan/contracts";
import { DemoNotice, SectionHeading, SiteShell } from "../../app/_components/site-chrome";

export type FundState = "loading" | "empty" | "error" | "restricted";

export const demoFund: Fund = {
  id: "a5600000-0000-4000-0000-000000000001",
  version: 1,
  name: "Quỹ minh họa dòng họ",
  currency: "VND",
  balanceVnd: "1250000",
  closedThrough: null,
};

export const demoJournals: readonly Journal[] = [
  {
    id: "a5600000-0000-4000-0000-000000000002",
    version: 1,
    code: "DEMO-2026-001",
    status: "posted",
    fundId: demoFund.id,
    entryDate: "2026-09-28",
    description: "Khoản thu minh họa — không phải giao dịch thật",
    lines: [
      { accountId: "a5600000-0000-4000-0000-000000000003", signedAmountVnd: "150000" },
      { accountId: "a5600000-0000-4000-0000-000000000004", signedAmountVnd: "-150000" },
    ],
  },
];

function groupDigits(value: string): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function formatVnd(value: string): string {
  return `${groupDigits(value)} ₫`;
}

export function FundStateCard({ status }: { status: FundState }) {
  const copy = {
    loading: ["Đang tải sổ quỹ", "Giữ bố cục trong khi kiểm tra quyền xem báo cáo."],
    empty: ["Chưa có kỳ quỹ được công bố", "Kỳ quỹ sẽ xuất hiện sau khi được ghi nhận và duyệt."],
    error: ["Không tải được sổ quỹ", "Thử lại sau; thông tin người đóng góp và chứng từ không nằm trong lỗi."],
    restricted: ["Sổ quỹ được giới hạn", "Phiên hiện tại chưa có quyền xem số dư hoặc chi tiết giao dịch."],
  }[status];
  return <div className="fund-state-card" role={status === "error" ? "alert" : "status"}><strong>{copy[0]}</strong><span>{copy[1]}</span></div>;
}

function amountFromJournal(journal: Journal): string {
  return journal.lines.find((line) => line.signedAmountVnd.startsWith("-"))?.signedAmountVnd.slice(1) ?? "0";
}

export function FundReader({ fund, journals }: { fund: Fund; journals: readonly Journal[] }) {
  const firstJournal = journals[0];
  const incomeVnd = firstJournal?.lines.find((line) => !line.signedAmountVnd.startsWith("-"))?.signedAmountVnd ?? "0";
  const expenseVnd = firstJournal ? amountFromJournal(firstJournal) : "0";
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page fund-page">
        <p className="eyebrow">Sinh hoạt dòng họ · Báo cáo theo quyền</p>
        <h1>Minh bạch quỹ</h1>
        <p className="page-lede">Số tiền hiển thị dưới dạng VND nguyên số. Đây là sổ nội bộ minh họa, không phải đồng bộ ngân hàng hay báo cáo tài chính bên ngoài.</p>
        <DemoNotice />
        <section className="fund-summary" aria-label="Tóm tắt quỹ">
          <div className="fund-balance-card"><span>Số dư hiện tại</span><strong>{formatVnd(fund.balanceVnd)}</strong><small>{fund.closedThrough ? `Đã khóa đến ${fund.closedThrough}` : "Kỳ hiện tại đang mở"}</small></div>
          <div className="fund-summary-card"><span>Thu trong fixture</span><strong>{formatVnd(incomeVnd)}</strong></div>
          <div className="fund-summary-card"><span>Chi trong fixture</span><strong>{formatVnd(expenseVnd)}</strong></div>
        </section>
        <SectionHeading title="Phiếu đã ghi sổ" />
        {journals.length === 0 ? <FundStateCard status="empty" /> : <div className="fund-entry-list">{journals.map((journal) => <article className="fund-entry-card" key={journal.id}><div className="fund-entry-head"><span>{journal.entryDate}</span><span className="fund-status">{journal.status === "posted" ? "Đã ghi sổ" : journal.status}</span></div><h2>{journal.description}</h2><dl className="detail-list"><div><dt>Mã phiếu</dt><dd>{journal.code}</dd></div><div><dt>Tổng dòng</dt><dd>{journal.lines.length} dòng · cân bằng 0 ₫</dd></div></dl></article>)}</div>}
        <div className="fund-privacy-note"><strong>Quyền riêng tư</strong><span>Người đóng góp và chứng từ không hiển thị trong báo cáo này nếu phiên chưa được cấp quyền phù hợp.</span></div>
      </main>
    </SiteShell>
  );
}