#!/usr/bin/env node
/**
 * CI 用：给 expo prebuild 生成的 android/app/build.gradle 加上"用我们自己的密钥签 release"。
 * 密钥路径/口令全部从环境变量来（GitHub Secrets），脚本本身不含任何机密。
 *
 * 用法：
 *   node scripts/apply-release-signing.js android/app/build.gradle
 */
const fs = require('fs');

const file = process.argv[2] || 'android/app/build.gradle';
let src = fs.readFileSync(file, 'utf8');

if (src.includes('signingConfigs.release') && src.includes('WB_KEYSTORE_PATH')) {
  console.log('已经打过签名补丁，跳过');
  process.exit(0);
}

const releaseSigning = `
        release {
            // 由 scripts/apply-release-signing.js 注入；口令走环境变量
            storeFile file(System.getenv("WB_KEYSTORE_PATH") ?: "release.keystore")
            storePassword System.getenv("WB_KEYSTORE_PASSWORD")
            keyAlias System.getenv("WB_KEY_ALIAS")
            keyPassword System.getenv("WB_KEY_PASSWORD")
        }`;

// 1) 在 signingConfigs { 之后插入 release 签名配置
const before = src;
src = src.replace(/signingConfigs\s*\{/, (m) => `${m}${releaseSigning}`);
if (src === before) {
  console.error('没找到 signingConfigs 块，模板结构可能变了');
  process.exit(1);
}

// 2) 只改 buildTypes → release 里的那处签名（不能全局替换，否则会把 debug 也改掉）
const btIdx = src.indexOf('buildTypes {');
if (btIdx < 0) {
  console.error('没找到 buildTypes 块，模板结构可能变了');
  process.exit(1);
}
const tail = src.slice(btIdx);
const relIdx = tail.indexOf('release {');
if (relIdx < 0) {
  console.error('buildTypes 里没找到 release 块');
  process.exit(1);
}
const relBody = tail.slice(relIdx);
if (!/signingConfig\s+signingConfigs\.debug/.test(relBody)) {
  console.error('release 里没有 signingConfig signingConfigs.debug');
  process.exit(1);
}
src =
  src.slice(0, btIdx) +
  tail.slice(0, relIdx) +
  relBody.replace(/signingConfig\s+signingConfigs\.debug/, 'signingConfig signingConfigs.release');

fs.writeFileSync(file, src);
console.log('已写入 release 签名配置 →', file);
