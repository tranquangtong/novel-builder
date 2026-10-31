"use client";
import { formatNumber, targetState } from "@/lib/domain/wordcount";

export function WordMeter({ words, target, compact }: { words: number; target: { min: number; max: number }; compact?: boolean }) {
  const st = targetState(words, target);
  const scale = target.max * 1.2;
  const label = st === "under" ? `còn thiếu ${formatNumber(target.min - words)}` : st === "over" ? `vượt ${formatNumber(words - target.max)}` : "trong mục tiêu";
  return (
    <span className={`meter ${st}`} title={`Mục tiêu ${formatNumber(target.min)}–${formatNumber(target.max)} chữ. Đếm thân chương, tách theo khoảng trắng; không gồm metadata và tiêu đề.`}>
      <span className="w" data-testid="word-count">{formatNumber(words)}</span>
      {!compact && <span>chữ</span>}
      <span className="meter-bar" aria-hidden>
        <span className="meter-band" style={{ left: `${(target.min / scale) * 100}%`, width: `${((target.max - target.min) / scale) * 100}%` }} />
        <span className="meter-fill" style={{ width: `${Math.min(100, (words / scale) * 100)}%` }} />
      </span>
      {!compact && <span className="muted">{formatNumber(target.min)}–{formatNumber(target.max)} · {label}</span>}
    </span>
  );
}
