/**
 * 自定义入口：必须是整个 App 最早执行的 JS。
 * 先装好全局错误上报，再进入 expo-router —— 这样连路由模块加载阶段的报错也能被上报，
 * 而不是白屏秒退、什么都留不下。
 */
const { installErrorReport, diag } = require('./src/diag');

installErrorReport();
diag('boot', 'entry: js started');

try {
  require('expo-router/entry');
  diag('boot', 'entry: expo-router loaded');
} catch (e) {
  diag('entry-fatal', { message: e && e.message, stack: e && e.stack });
  throw e;
}
