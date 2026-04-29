# JD-Ray Local / 岗位黑话解码

一个本地优先的岗位截图分析工具。上传或粘贴 JD 截图，可选同步 Markdown / TXT 简历，调用 Gemini 或 Qwen-VL 生成结构化的“岗位真相”分析报告。

## 特性

- 暗色移动端优先界面，桌面端以手机宽度居中预览。
- 支持上传、拖拽、粘贴 JD 截图。
- 支持可选简历输入，`.md` / `.txt` 文件或直接粘贴文本。
- 支持 Gemini 2.5 Flash 与 Qwen3 VL Plus。
- API Key 仅保存在本机 `localStorage`，不内置、不上传。
- 最近分析保存在本机 `localStorage`，不保存原始截图和简历全文。
- 支持 Android APK：基于 Capacitor WebView，无远端后端服务器。
- 报告页支持本地支付宝二维码打赏入口。

## 技术栈

- Vite
- React
- Capacitor Android
- Gemini API
- DashScope OpenAI-compatible Qwen-VL API
- jsQR

## 本地开发

```bash
npm install
npm run dev
```

开发地址默认是：

```text
http://127.0.0.1:5177/
```

## Web 构建

```bash
npm run build
```

构建产物输出到 `public/`，该目录也是 Capacitor 的 `webDir`。

## Android 调试包

```bash
npm run build
npm run cap:sync
cd android
./gradlew assembleDebug
```

调试包位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Android 正式包

正式包需要 release keystore。当前项目支持读取：

```text
android/keystore.properties
android/jd-ray-release.jks
```

`keystore.properties` 示例：

```properties
storeFile=jd-ray-release.jks
storePassword=your_store_password
keyAlias=jd-ray-release
keyPassword=your_key_password
```

这些签名文件已被 `.gitignore` 排除，不能提交到 GitHub。后续升级同一个 Android 应用必须继续使用同一份 keystore。

生成正式 APK：

```bash
npm run build
npm run cap:sync
cd android
./gradlew assembleRelease
```

正式 APK 位置：

```text
android/app/build/outputs/apk/release/app-release.apk
```

## 模型配置

首次使用需要在应用底部模型 Dock 的钥匙按钮中配置 API Key。

- Gemini：填写 Google Gemini API Key。
- Qwen：填写阿里云 DashScope API Key，并选择对应区域 endpoint。

所有 Key 只保存在当前设备浏览器 / WebView 的 `localStorage` 中。

## 隐私说明

- 无远端业务后端。
- 原始岗位截图不进入历史记录。
- 简历全文不进入历史记录。
- 最近分析只保存结构化报告、岗位标题、公司、结论、模型来源等本地数据。
- 调用模型 API 时，截图和可选简历文本会发送给当前选中的模型服务商。

## 发布前检查

- 确认 `android/app/build.gradle` 中 `versionCode` 已递增。
- 确认 `versionName` 符合发布版本。
- 确认 release keystore 已备份。
- 真机验证：图片选择、模型调用、历史删除、支付宝打赏入口。

## 仓库命名

当前本地文件夹名保留为 `jd-image-analyzer`。对外展示名使用：

```text
JD-Ray Local / 岗位黑话解码
```
