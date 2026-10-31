import { ProposalReview } from "@/components/ProposalReview";

export default async function Page({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  return <ProposalReview number={Number(n)} />;
}
