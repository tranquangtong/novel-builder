import { ChapterEditor } from "@/components/ChapterEditor";

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChapterEditor key={id} id={id} />;
}
