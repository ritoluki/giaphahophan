import type { Metadata } from "next";
import { PlaceIndex, demoPlaces } from "../../modules/m13/place-reader";

export const metadata: Metadata = {
  title: "Nhà thờ và địa điểm · Phan Gia Phả",
  description: "Địa điểm tưởng niệm và nơi thờ tự được hiển thị theo quyền truy cập.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function PlacesPage() {
  return <PlaceIndex places={demoPlaces} />;
}