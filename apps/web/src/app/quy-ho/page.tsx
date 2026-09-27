import { FundReader, demoFund, demoJournals } from "../../modules/m14/fund-reader";

export const metadata = {
  title: "Minh bạch quỹ | Phan Gia Phả",
  robots: { index: false, follow: false },
};

export default function FundPage() {
  return <FundReader fund={demoFund} journals={demoJournals} />;
}