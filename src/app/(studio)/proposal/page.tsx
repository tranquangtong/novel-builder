"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProposalReview } from "@/components/ProposalReview";

function Inner() {
  const n = Number(useSearchParams().get("n"));
  return n > 0 ? <ProposalReview key={n} number={n} /> : <div className="page"><div className="page-inner"><div className="banner warn">Thiếu số đề xuất.</div></div></div>;
}

export default function ProposalPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
