/**
 * 语音：念回复（expo-speech / 系统 TTS）+ 说话转文字（录音 → OpenAI 兼容的 /audio/transcriptions）。
 * 转写要用一个支持语音的供应商（例如硅基流动的 SenseVoice、OpenAI 的 whisper-1），
 * 在「设置 → 语音」里选供应商 + 填模型名即可；没配就只做朗读。
 */
import { fetch as expoFetch } from 'expo/fetch';
import * as Speech from 'expo-speech';
import type { Config } from './config';

/* ---------------- 朗读（TTS） ---------------- */

/** 把回复整理成"人话"：去掉代码块、markdown 符号、超长链接 */
export function speakable(text: string, limit = 800): string {
  let t = text
    .replace(/```[\s\S]*?```/g, '（代码块略过）')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '链接')
    .replace(/[*_>#~|]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '。\n')
    .trim();
  if (t.length > limit) t = `${t.slice(0, limit)}…（后面还有 ${t.length - limit} 字）`;
  return t;
}

export function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync().catch(() => false);
}

export function stopSpeaking(): void {
  void Speech.stop();
}

/** 念一段文字（先掐掉上一段，避免排队念一长串） */
export function speak(text: string, opts: { rate?: number; lang?: string } = {}): void {
  const body = speakable(text);
  if (!body) return;
  void Speech.stop();
  Speech.speak(body, {
    language: opts.lang ?? 'zh-CN',
    rate: opts.rate ?? 1,
    onError: () => {
      /* 有些机器没装中文语音包，静默失败即可 */
    },
  });
}

export async function voices(): Promise<{ identifier: string; name: string; language: string }[]> {
  try {
    const list = await Speech.getAvailableVoicesAsync();
    return list.map((v) => ({ identifier: v.identifier, name: v.name, language: v.language }));
  } catch {
    return [];
  }
}

/* ---------------- 录音转写（STT） ---------------- */

export type TranscribeResult = { ok: boolean; text?: string; error?: string };

/**
 * 把录音文件发给 OpenAI 兼容的 /audio/transcriptions。
 * 注意：不要手动设 Content-Type，让 fetch 自己带 multipart 边界。
 */
export async function transcribe(
  cfg: Config,
  fileUri: string,
  opts: { baseUrl: string; apiKey: string; model: string },
): Promise<TranscribeResult> {
  if (!opts.model) return { ok: false, error: '没有配置语音输入的模型名' };
  if (!opts.apiKey) return { ok: false, error: '没有可用的 API Key' };
  const base = (opts.baseUrl || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: '没有配置接口地址' };

  const form = new FormData();
  // RN 的 FormData 支持 {uri,name,type} 这种"文件对象"
  form.append('file', {
    uri: fileUri,
    name: 'speech.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);
  form.append('model', opts.model);
  form.append('language', 'zh');

  try {
    const res = await expoFetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: form,
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}：${raw.slice(0, 200)}` };
    }
    let text = '';
    try {
      const json: any = JSON.parse(raw);
      text = String(json?.text ?? json?.result ?? '');
    } catch {
      text = raw;
    }
    text = text.trim();
    if (!text) return { ok: false, error: '转写结果为空（可能是模型不支持这个格式）' };
    return { ok: true, text };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
