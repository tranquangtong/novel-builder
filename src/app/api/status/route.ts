import { json, guarded } from "@/lib/server/api";
import { publicConfigStatus } from "@/lib/server/config";

/** Trạng thái cấu hình (chỉ cho biết biến nào ĐÃ đặt, không bao giờ trả giá trị). */
export const GET = guarded(async () => json(publicConfigStatus()));
