import { timingSafeEqual } from "node:crypto";

/** 设置了 ACCESS_CODE 时，新建商品、修改商品需要在请求头 x-access-code 里带上它；查看永远公开 */
export const NEED_CODE = !!process.env.ACCESS_CODE;

export function codeOk(req: Request): boolean {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return true;
  const got = req.headers.get("x-access-code") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
