import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceDetail, demoPlaces } from "../../../modules/m13/place-reader";

export const metadata: Metadata = {
  title: "Địa điểm · Phan Gia Phả",
  description: "Thông tin địa điểm được hiển thị theo quyền truy cập.",
  robots: { index: false, follow: false, noarchive: true },
};

export function generateStaticParams() {
  return demoPlaces.map((place) => ({ id: place.id }));
}

export default async function PlaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = demoPlaces.find((item) => item.id === id);
  if (!place) notFound();
  return <PlaceDetail place={place} />;
}