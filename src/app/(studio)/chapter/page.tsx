"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChapterEditor } from "@/components/ChapterEditor";

function Inner() {
  const id = useSearchParams().get("id") ?? "";
  return id ? <ChapterEditor key={id} id={id} /> : <div className="page"><div className="page-inner"><div className="banner warn">Thiếu mã chương.</div></div></div>;
}

export default function ChapterPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
