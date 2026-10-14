/** 纯常量（不依赖任何原生模块，方便单测直接 require） */
/** 单个附件上限：base64 要在内存里过一遍 */
export const MAX_ATTACH_BYTES = 12 * 1024 * 1024;
/** 一次最多内联几张图（多了又慢又贵） */
export const MAX_INLINE_IMAGES = 4;
