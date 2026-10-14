/**
 * 附件：拍照 / 相册 / 文件三种来源。
 * 图片可选地作为多模态内容给模型看；所有附件都会先落到容器工作目录，
 * 这样容器里的 shell/python 也能直接处理它（模型拿到的是路径）。
 */
import { execTool } from './api';
import type { Config } from './config';

export type PickedAttachment = {
  id: string;
  kind: 'image' | 'file';
  name: string;
  mime: string;
  size?: number;
  /** 本地 uri（预览用） */
  uri: string;
  /** base64（不含 data: 前缀） */
  base64?: string;
  /** 上传到容器后的绝对路径 */
  path?: string;
};

/** 单个附件上限：base64 内存里要装得下，超过就不传了 */
export const MAX_ATTACH_BYTES = 12 * 1024 * 1024;

const safeName = (name: string) =>
  (name || 'file')
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 60) || 'file';

export const dataUrlFor = (a: PickedAttachment) =>
  a.base64 ? `data:${a.mime || 'image/jpeg'};base64,${a.base64}` : '';

/** 把附件写进容器工作目录，返回路径 */
export async function uploadAttachment(
  cfg: Config,
  a: PickedAttachment,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!a.base64) return { ok: false, error: '没有读到文件内容' };
  if (a.size && a.size > MAX_ATTACH_BYTES) {
    return { ok: false, error: `文件太大（${Math.round(a.size / 1024 / 1024)}MB > 12MB）` };
  }
  const stamp = new Date().toISOString().slice(5, 19).replace(/[:T-]/g, '');
  const path = `uploads/${stamp}-${safeName(a.name)}`;
  try {
    const res: any = await execTool(cfg, 'fs.write_b64', { path, base64: a.base64 });
    if (!res?.ok) return { ok: false, error: String(res?.stderr ?? '写入失败') };
    return { ok: true, path: String(res?.data?.path ?? path) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/** 预估一下体积，最多给模型 4 张图（多了又慢又贵） */
export const MAX_INLINE_IMAGES = 4;
