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
  temple: "Nhà thờ",
  cemetery: "Khu mộ",
  grave: "Mộ phần",
  hometown: "Quê quán",
  other: "Địa điểm khác",
};

export function PlaceStateCard({ status }: { status: PlaceListState }) {
  const copy = {
    loading: ["Đang tải địa điểm", "Giữ nguyên danh sách trong khi kiểm tra dữ liệu đã được cấp quyền."],
    empty: ["Chưa có địa điểm được chia sẻ", "Địa điểm sẽ xuất hiện sau khi được ghi nhận và duyệt quyền xem."],
    error: ["Không tải được địa điểm", "Thử lại sau; dữ liệu riêng tư không bị lộ trong thông báo lỗi."],
    restricted: ["Địa điểm được giới hạn", "Phiên hiện tại chưa có quyền xem thông tin chi tiết của nơi này."],
  }[status];
  return <div className="place-state-card" role={status === "error" ? "alert" : "status"}><strong>{copy[0]}</strong><span>{copy[1]}</span></div>;
}

export function PlaceIndex({ places }: { places: readonly PlaceRecord[] }) {
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page place-page">
        <p className="eyebrow">Không gian tưởng niệm · Theo quyền truy cập</p>
        <h1>Nhà thờ và địa điểm</h1>
        <p className="page-lede">Địa điểm thờ tự, khu mộ và nơi lưu dấu được ghi nhận riêng với địa chỉ nhà của người đang sống. Tọa độ chỉ hiện khi có quyền phù hợp.</p>
        <DemoNotice />
        <SectionHeading title="Danh sách địa điểm" />
        {places.length === 0 ? <PlaceStateCard status="empty" /> : <div className="place-card-list">{places.map((place) => <Link className="place-card" href={`/dia-diem/${place.id}`} key={place.id}><span className="place-card-kind">{kindLabels[place.kind]}</span><h2>{place.name}</h2><p>{place.addressText}</p><span className="place-card-link">Mở thông tin →</span></Link>)}</div>}
        <div className="place-privacy-note"><strong>Ranh giới dữ liệu</strong><span>Không tự động định vị, geocode hoặc gửi tọa độ riêng tư sang dịch vụ bản đồ.</span></div>
      </main>
    </SiteShell>
  );
}

export function ExternalMapAction({ href }: { href: string | null }) {
  return href
    ? <a className="button-secondary place-map-action" href={href} target="_blank" rel="noreferrer">Mở bản đồ ngoài</a>
    : <span className="place-map-unavailable">Chưa có quyền tọa độ để mở bản đồ ngoài</span>;
}
export function PlaceDetail({ place }: { place: PlaceRecord }) {
  const directions = demoDirections.find((item) => item.placeId === place.id);
  return (
    <SiteShell active="more">
      <main id="main-content" className="container page place-page">
        <Link className="back-link" href="/dia-diem">← Về danh sách địa điểm</Link>
        <article className="place-detail-card">
          <p className="eyebrow">{kindLabels[place.kind]}</p>
          <h1>{place.name}</h1>
          <dl className="detail-list place-detail-list">
            <div><dt>Địa chỉ được phép</dt><dd>{place.addressText ?? "Chưa có thông tin"}</dd></div>
            <div><dt>Tọa độ</dt><dd>{place.latitude === null ? "Đang được giới hạn theo quyền" : "Chỉ mở khi có quyền tọa độ"}</dd></div>
            <div><dt>Tư liệu nguồn</dt><dd>Chưa có tư liệu được gắn trong fixture minh họa</dd></div>
            <div><dt>Ảnh</dt><dd>Chưa có ảnh được cấp quyền</dd></div>
          </dl>
          <section className="place-detail-section" aria-labelledby="place-media-heading">
            <h2 id="place-media-heading">Tư liệu hình ảnh</h2>
            <PlaceStateCard status="empty" />
          </section>
          <section className="place-detail-section" aria-labelledby="place-directions-heading">
            <h2 id="place-directions-heading">Hướng dẫn đường đi</h2>
            {directions ? <div className="place-directions-card"><p>{directions.instructionText}</p><span>Nguồn hướng dẫn: chưa gắn tư liệu trong fixture minh họa</span></div> : <PlaceStateCard status="empty" />}
          </section>
          <div className="place-privacy-note"><strong>Bản đồ ngoài</strong><span>Chỉ mở dịch vụ ngoài sau khi người dùng chủ động chọn và hệ thống xác nhận quyền tọa độ.</span><ExternalMapAction href={null} /></div>
        </article>
      </main>
    </SiteShell>
  );
}