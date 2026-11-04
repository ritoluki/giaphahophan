import type { Fund, Journal, ReconciliationRecord, Report } from "@phan/contracts";
import { DemoNotice, SectionHeading, SiteShell } from "../../app/_components/site-chrome";
import { formatDisplayDate, journalStatusLabels } from "../../lib/ui-labels";

export type FundState = "loading" | "empty" | "error" | "restricted";

export const demoFund: Fund = {
  id: "a5600000-0000-4000-0000-000000000001",
  version: 1,
  name: "Quỹ minh họa dòng họ",
  currency: "VND",
  balanceVnd: "1250000",
  closedThrough: null,
};

export const demoReport: Report = {
  fundId: demoFund.id,
  from: "2026-09-01",
  to: "2026-09-30",
  openingVnd: "1100000",
  incomeVnd: "250000",
  expenseVnd: "100000",
  closingVnd: "1250000",
};
export const demoReconciliation: ReconciliationRecord = {
  fundId: demoFund.id,
  from: demoReport.from,
  to: demoReport.to,
  status: "locked",
  version: 2,
  report: demoReport,
  postedEntries: 1,
  proof: { total: 1, ready: 0, pending: 0, missing: 1, rejected: 0 },
  lockedAt: "2026-09-28T00:00:00.000Z",
};export const demoJournals: readonly Journal[] = [
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
    loading: ["Đang tải sổ quỹ", "Vui lòng chờ trong giây lát."],
    empty: ["Chưa có kỳ quỹ được công bố", "Kỳ quỹ sẽ xuất hiện sau khi được ghi nhận và duyệt."],
    error: ["Không tải được sổ quỹ", "Hãy kiểm tra kết nối rồi thử lại."],
    restricted: ["Bạn chưa có quyền xem sổ quỹ", "Hãy liên hệ người phụ trách quỹ nếu cần xem báo cáo này."],
  }[status];
  return <div className="fund-state-card" role={status === "error" ? "alert" : "status"}><strong>{copy[0]}</strong><span>{copy[1]}</span></div>;
}

export function FundReader({ fund, journals, report = demoReport, reconciliation = demoReconciliation }: { fund: Fund; journals: readonly Journal[]; report?: Report; reconciliation?: ReconciliationRecord }) {
  const incomeVnd = report.incomeVnd;
  const expenseVnd = report.expenseVnd;
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page fund-page">
        <h1>Quỹ họ</h1>
        <p className="page-lede">{fund.name} · Kỳ {formatDisplayDate(report.from)} – {formatDisplayDate(report.to)}</p>
        <DemoNotice />
        <section className="fund-summary" aria-label="Tóm tắt quỹ">
          <div className="fund-balance-card"><span>Số dư quỹ</span><strong>{formatVnd(fund.balanceVnd)}</strong><small>{fund.closedThrough ? `Đã khóa sổ đến ${formatDisplayDate(fund.closedThrough)}` : "Sổ quỹ chưa khóa"}</small></div>
          <div className="fund-summary-card"><span>Thu trong kỳ</span><strong>{formatVnd(incomeVnd)}</strong></div>
          <div className="fund-summary-card"><span>Chi trong kỳ</span><strong>{formatVnd(expenseVnd)}</strong></div>
        </section>
        <SectionHeading title="Báo cáo kỳ" />
        <section className="fund-report-grid" aria-label="Báo cáo kỳ">
          <div className="fund-summary-card"><span>Số dư đầu kỳ</span><strong>{formatVnd(report.openingVnd)}</strong></div>
          <div className="fund-summary-card"><span>Tổng thu</span><strong>{formatVnd(report.incomeVnd)}</strong></div>
          <div className="fund-summary-card"><span>Tổng chi</span><strong>{formatVnd(report.expenseVnd)}</strong></div>
          <div className="fund-summary-card"><span>Số dư cuối kỳ</span><strong>{formatVnd(report.closingVnd)}</strong></div>
        </section>
        <SectionHeading title="Đối chiếu kỳ" />
        <section className="fund-reconciliation-card" aria-label="Đối chiếu kỳ">
          <div className="fund-reconciliation-head"><strong>{reconciliation.status === "locked" ? "Kỳ đã khóa sổ" : "Kỳ đang mở"}</strong><span>{formatDisplayDate(reconciliation.from)} – {formatDisplayDate(reconciliation.to)}</span></div>
          <p>{reconciliation.postedEntries} phiếu đã ghi sổ</p>
          <dl className="fund-proof-status">
            <div><dt>Chứng từ sẵn sàng</dt><dd>{reconciliation.proof.ready}</dd></div>
            <div><dt>Đang xử lý</dt><dd>{reconciliation.proof.pending}</dd></div>
            <div><dt>Chưa có</dt><dd>{reconciliation.proof.missing}</dd></div>
            <div><dt>Bị từ chối</dt><dd>{reconciliation.proof.rejected}</dd></div>
          </dl>
          <small>Đây là báo cáo sổ quỹ nội bộ, chưa phải xác nhận của ngân hàng hay kiểm toán.</small>
        </section><SectionHeading title="Các phiếu trong kỳ" />
        {journals.length === 0 ? <FundStateCard status="empty" /> : <div className="fund-entry-list">{journals.map((journal) => <article className="fund-entry-card" key={journal.id}><div className="fund-entry-head"><span>{formatDisplayDate(journal.entryDate)}</span><span className="fund-status">{journalStatusLabels[journal.status]}</span></div><h2>{journal.description}</h2><dl className="detail-list"><div><dt>Mã phiếu</dt><dd>{journal.code}</dd></div><div><dt>Chi tiết</dt><dd>{journal.lines.length} dòng ghi sổ</dd></div><div><dt>Cân đối</dt><dd>{journal.lines.reduce((sum, line) => sum + BigInt(line.signedAmountVnd), 0n) === 0n ? "Phiếu cân bằng" : "Cần kiểm tra lại"}</dd></div></dl></article>)}</div>}
        <div className="fund-privacy-note"><strong>Thông tin người đóng góp</strong><span>Tên người đóng góp và chứng từ chỉ được chia sẻ với người có quyền xem.</span></div>
      </main>
    </SiteShell>
  );
}
