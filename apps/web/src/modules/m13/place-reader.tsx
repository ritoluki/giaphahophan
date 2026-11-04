import Link from "next/link";
import { DemoNotice, SectionHeading, SiteShell } from "../../app/_components/site-chrome";
import type { PlaceDirections, PlaceRecord } from "@phan/contracts";

export type PlaceListState = "loading" | "empty" | "error" | "restricted";

export const demoPlaces: readonly PlaceRecord[] = [
  {
    id: "a3500000-0000-4000-8000-000000000001",
    version: 1,
    name: "Khu tưởng niệm minh họa",
    kind: "cemetery",
    addressText: "Địa chỉ minh họa; không phải địa chỉ nhà người sống.",
    latitude: null,
    longitude: null,
    visibility: "members",
    coordinateVisibility: "restricted",
  },
];
export const demoDirections: readonly PlaceDirections[] = [
  {
    id: "a3500000-0000-4000-8000-000000000011",
    version: 1,
    placeId: "a3500000-0000-4000-8000-000000000001",
    instructionText: "Hướng dẫn minh họa: đi theo lối chính vào khu tưởng niệm; nội dung này không phải chỉ dẫn đến địa chỉ nhà người sống.",
    sourceId: null,
    visibility: "members",
  },
];

const kindLabels: Record<PlaceRecord["kind"], string> = {
  temple: "Nhà thờ họ",
  cemetery: "Khu mộ",
  grave: "Mộ phần",
  hometown: "Quê quán",
  other: "Địa điểm khác",
};

export function PlaceStateCard({ status }: { status: PlaceListState }) {
  const copy = {
    loading: ["Đang tải địa điểm", "Vui lòng chờ trong giây lát."],
    empty: ["Chưa có địa điểm được chia sẻ", "Địa điểm sẽ xuất hiện sau khi được ghi nhận và duyệt quyền xem."],
    error: ["Không tải được địa điểm", "Hãy kiểm tra kết nối rồi thử lại."],
    restricted: ["Bạn chưa có quyền xem địa điểm này", "Hãy đăng nhập hoặc liên hệ người phụ trách gia phả."],
  }[status];
  return <div className="place-state-card" role={status === "error" ? "alert" : "status"}><strong>{copy[0]}</strong><span>{copy[1]}</span></div>;
}

export function PlaceIndex({ places }: { places: readonly PlaceRecord[] }) {
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page place-page">
        <h1>Nhà thờ và địa điểm</h1>
        <p className="page-lede">Nơi thờ tự, khu mộ và những nơi gắn với gia đình.</p>
        <DemoNotice />
        <SectionHeading title="Danh sách địa điểm" />
        {places.length === 0 ? <PlaceStateCard status="empty" /> : <div className="place-card-list">{places.map((place) => <Link className="place-card" href={`/dia-diem/${place.id}`} key={place.id}><h2>{place.name}</h2><p className="place-card-kind">{kindLabels[place.kind]}</p><p>{place.addressText}</p><span className="place-card-link">Xem địa điểm →</span></Link>)}</div>}
        <div className="place-privacy-note"><strong>Thông tin địa điểm</strong><span>Chỉ địa điểm được chia sẻ với bạn mới xuất hiện ở đây. Website không tự lấy vị trí của bạn.</span></div>
      </main>
    </SiteShell>
  );
}

export function ExternalMapAction({ href }: { href: string | null }) {
  return href
    ? <a className="button-secondary place-map-action" href={href} target="_blank" rel="noreferrer">Xem trên bản đồ (mở trang mới)</a>
    : <span className="place-map-unavailable">Chưa có bản đồ được chia sẻ</span>;
}
export function PlaceDetail({ place }: { place: PlaceRecord }) {
  const directions = demoDirections.find((item) => item.placeId === place.id);
  return (
    <SiteShell active="more">
      <main id="main-content" tabIndex={-1} className="container page place-page">
        <Link className="back-link" href="/dia-diem">← Về danh sách địa điểm</Link>
        <article className="place-detail-card">
          <h1>{place.name}</h1>
          <p className="page-lede">{kindLabels[place.kind]}</p>
          <DemoNotice />
          <dl className="detail-list place-detail-list">
            <div><dt>Địa chỉ</dt><dd>{place.addressText ?? "Chưa có thông tin"}</dd></div>
            <div><dt>Bản đồ</dt><dd>Chưa có bản đồ được chia sẻ trong bản dùng thử</dd></div>
            <div><dt>Nguồn tư liệu</dt><dd>Chưa gắn tư liệu trong bản minh họa</dd></div>
            <div><dt>Ảnh</dt><dd>Chưa có ảnh được chia sẻ</dd></div>
          </dl>
          <section className="place-detail-section" aria-labelledby="place-media-heading">
            <h2 id="place-media-heading">Tư liệu hình ảnh</h2>
            <PlaceStateCard status="empty" />
          </section>
          <section className="place-detail-section" aria-labelledby="place-directions-heading">
            <h2 id="place-directions-heading">Hướng dẫn đường đi</h2>
            {directions ? <div className="place-directions-card"><p>{directions.instructionText}</p><span>Chưa gắn tư liệu cho hướng dẫn minh họa này.</span></div> : <p>Chưa có hướng dẫn đường đi.</p>}
          </section>
          <div className="place-privacy-note"><strong>Xem đường đi</strong><span>Nếu có bản đồ được chia sẻ, bạn có thể chủ động mở ứng dụng bản đồ để tìm đường.</span><ExternalMapAction href={null} /></div>
        </article>
      </main>
    </SiteShell>
  );
}
