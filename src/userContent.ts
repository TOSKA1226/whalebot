/**
 * 把「用户这句话 + 附件」拼成发给模型的内容。
 * 抽成纯函数是为了能单独测：多模态内容和纯文本两条路都不该出岔子
 * （给不支持图片的模型发数组会被接口 400 拒掉）。
 */
import type { ContentPart, MsgContent } from './api';
import { MAX_INLINE_IMAGES } from './limits';

export type OutgoingAttachment = {
  kind: 'image' | 'file';
  name: string;
  mime?: string;
  /** 已上传到容器后的绝对路径 */
  path?: string;
  /** 图片的 data URL（data:image/...;base64,...） */
  dataUrl?: string;
};

/** 附件在正文里留一行"东西在哪"，模型据此去读/处理 */
export function attachmentNote(a: OutgoingAttachment): string {
  const where = a.path ? ` 已放到容器：${a.path}` : ' （还没落到容器）';
  return `[附件] ${a.name}${a.mime ? ` (${a.mime})` : ''}${where}`;
}

export function buildUserContent(
  text: string,
  attachments: OutgoingAttachment[] = [],
  vision = false,
): MsgContent {
  const notes = attachments.map(attachmentNote);
  const body = notes.length ? `${text}\n\n${notes.join('\n')}` : text;
  const images = vision
    ? attachments.filter((a) => a.kind === 'image' && a.dataUrl).slice(0, MAX_INLINE_IMAGES)
    : [];
  if (!images.length) return body;
  const parts: ContentPart[] = [
    { type: 'text', text: body },
    ...images.map((a) => ({
      type: 'image_url' as const,
      image_url: { url: a.dataUrl as string },
    })),
  ];
  return parts;
}
