/**
 * 群协作（多助手）编排：提示词 + 组长任务清单解析。
 * 这里全是纯函数（不碰网络/存储），方便单独验证解析逻辑。
 *
 * 一轮群协作的流程：
 *   用户下令 → 组长拆活（dispatchPrompt） → 各成员干活（workerPrompt）
 *   → 成员成果回给组长（summaryPrompt） → 组长在群里总结（leaderFinalPrompt 复用 summaryPrompt）
 */

export type Assignment = { agent: string; task: string };
export type Member = { id: string; name: string; description?: string };

const memberLines = (members: Member[]) =>
  members.length
    ? members.map((m) => `- ${m.name}${m.description ? `：${m.description}` : ''}`).join('\n')
    : '（暂时没有其他成员）';

/** 组长拆活 */
export function dispatchPrompt(userText: string, leaderName: string, members: Member[]): string {
  return `[群协作 · 你是组长 ${leaderName}]

用户在群里下了任务：
「${userText}」

你的组员：
${memberLines(members)}

请按下面的方式回应：
1. 先用一两句自然的话，向用户说明你打算怎么安排（不要客套，不要重复任务原文）。
2. 然后输出一个 JSON 数组，把活拆给真正需要的组员，格式严格如下：
\`\`\`json
[{"agent":"组员名字","task":"交给这个组员的具体任务，写清要产出什么"}]
\`\`\`
要求：agent 必须用上面列出的组员名字原文；不需要干活的组员不要出现在数组里；如果没有需要拆的活，输出空数组 []。
JSON 必须能被 JSON.parse 解析，不要写注释。`;
}

/** 成员干活（各自直接向用户汇报） */
export function workerPrompt(
  userText: string,
  task: string,
  leaderName: string,
  memberName: string,
): string {
  return `[群协作 · 你是 ${memberName}，组长是 ${leaderName}]

组长派给你的任务：
「${task}」

用户最初在群里说的原话：
「${userText}」

请专心完成你这一份任务，然后直接向用户汇报成果：
- 只讲你负责的这部分，别替别人发言、别复述别人的活；
- 有结论就写结论，做了什么、发现了什么、结论是什么；
- 需要动手就动手（工具调用照常）；
- 篇幅控制在 300 字以内。`;
}

/** 成员的成果交回组长，由组长做最终汇报 */
export function summaryPrompt(
  userText: string,
  leaderName: string,
  results: { name: string; task?: string; output: string }[],
): string {
  const body = results.length
    ? results
        .map(
          (r, i) =>
            `### 组员 ${i + 1}：${r.name}\n${r.task ? `任务：${r.task}\n` : ''}成果：${r.output || '（没有产出）'}`,
        )
        .join('\n\n')
    : '（没有任何组员产出成果）';
  return `[群协作 · 你是组长 ${leaderName}，现在做总结]

用户最初在群里下的任务：
「${userText}」

各成员交回给你的成果：
${body}

请你作为组长在群里向用户做最终汇报：
- 用一段话讲清楚最终结果（不要罗列每个组员的原话）；
- 如果成员之间结论冲突，你来定一个结论并说明理由；
- 如果有没做成的地方，直接说明；
- 不要再派活，不要输出 JSON；
- 控制在 400 字以内。`;
}

/** 用户在群里点名某个助手时，直接把它叫出来干活 */
export function mentionPrompt(userText: string, names: string[], speaker: string): string {
  return `[群协作 · 用户点名]
用户这次只点名了：${names.map((n) => `@${n}`).join('、')}（你是 ${speaker}）。

用户原话：
「${userText}」

请以你自己的身份处理这件事并向用户汇报。注意：这是用户的点名，不要代表组长或其他助手发言，也不要替别人安排工作。`;
}

/** 从模型输出里抽出 JSON 数组（兼容 ```json 代码块 / 裸数组 / 单对象） */
function extractJson(text: string): any[] | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates: string[] = [];
  if (fence) candidates.push(fence[1]);
  const arr = /\[[\s\S]*\]/.exec(text);
  if (arr) candidates.push(arr[0]);
  const obj = /\{[\s\S]*\}/.exec(text);
  if (obj) candidates.push(`[${obj[0]}]`);
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') return [v];
    } catch {
      // 试下一个
    }
  }
  return null;
}

/** 名字对不上时做一次宽松匹配（模型可能写简称/带前缀） */
function matchMember(name: string, members: Member[]): Member | undefined {
  const n = name.trim().replace(/^@/, '');
  if (!n) return undefined;
  return (
    members.find((m) => m.name === n) ??
    members.find((m) => m.name.startsWith(n) || n.startsWith(m.name)) ??
    members.find((m) => m.name.includes(n) || n.includes(m.name))
  );
}

/**
 * 把组长的输出解析成任务清单。
 * 先按 JSON 解析；失败再退化成「名字：任务」逐行解析；两条路都不行就返回空数组。
 */
export function parseAssignments(text: string, members: Member[]): Assignment[] {
  const out: Assignment[] = [];
  const seen = new Set<string>();
  const push = (name: string, task: string) => {
    const m = matchMember(name, members);
    const key = m?.id ?? name.trim();
    if (!m || !task.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ agent: m.name, task: task.trim() });
  };

  const json = extractJson(text);
  if (json) {
    for (const it of json) {
      if (!it || typeof it !== 'object') continue;
      const name = String((it as any).agent ?? (it as any).name ?? (it as any).to ?? '');
      const task = String((it as any).task ?? (it as any).prompt ?? '');
      push(name, task);
    }
  }
  if (out.length) return out;

  // 退化路径：逐行找「名字：任务」/「- 名字 - 任务」
  for (const line of text.split('\n')) {
    const m = /^\s*[-*\d.、]*\s*@?([^\s:：\-]{1,20})\s*[:：\-]\s*(.+)$/.exec(line);
    if (!m) continue;
    push(m[1], m[2]);
  }
  return out;
}

/** 去掉给用户看的那段文字里的 JSON 计划块（避免聊天里出现一大坨 JSON） */
export function stripPlanBlock(text: string): string {
  return text
    .replace(/```(?:json)?[\s\S]*?```/gi, '')
    .replace(/\[\s*\{[\s\S]*\}\s*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 找出文本里 @ 到的群成员。
 * 长名字优先（避免「小鲸」抢了「小鲸鱼」），并容忍简称与「@名字+紧跟正文」的写法。
 */
export function parseMentions(text: string, members: Member[]): Member[] {
  const tokens = Array.from(text.matchAll(/@([^\s@，,。.！!？?、:：;；]+)/g)).map((m) => m[1]);
  const byLen = [...members].sort((a, b) => b.name.length - a.name.length);
  const out: Member[] = [];
  for (const tk of tokens) {
    const m =
      byLen.find((x) => x.name === tk) ??
      byLen.find((x) => tk.startsWith(x.name)) ??
      byLen.find((x) => x.name.startsWith(tk));
    if (m && !out.some((x) => x.id === m.id)) out.push(m);
  }
  return out;
}
