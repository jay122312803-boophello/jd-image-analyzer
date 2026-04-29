import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import jsQR from "jsqr";
import alipayQrUrl from "./assets/alipay-qr.jpg";
import "./styles.css";

const API_KEYS_STORAGE = "jd_ray_api_keys";
const REPORTS_STORAGE = "jd_ray_reports";
const ACTIVE_PROVIDER_STORAGE = "jd_ray_active_provider";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const QWEN_MODEL = "qwen3-vl-plus";
const QWEN_DEFAULT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const QWEN_ENDPOINTS = [
  { id: "beijing", label: "北京", value: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "singapore", label: "Singapore", value: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  { id: "virginia", label: "Virginia", value: "https://dashscope-us.aliyuncs.com/compatible-mode/v1" }
];
const PROVIDERS = {
  gemini: {
    id: "gemini",
    vendor: "Google",
    label: "Gemini",
    dockLabel: "Gemini 2.5",
    dockMeta: "Flash",
    displayName: "Gemini 2.5 Flash",
    historyLabel: "Gemini",
    model: GEMINI_MODEL,
    keyLabel: "Gemini API Key",
    placeholder: "粘贴你的 Gemini API Key"
  },
  qwen: {
    id: "qwen",
    vendor: "阿里云",
    label: "Qwen",
    dockLabel: "Qwen3",
    dockMeta: "VL Plus",
    displayName: "Qwen3 VL Plus",
    historyLabel: "Qwen",
    model: QWEN_MODEL,
    keyLabel: "Qwen API Key",
    placeholder: "粘贴你的 DashScope API Key"
  }
};

const emptyReport = {
  meta: { roleTitle: "未知岗位", company: "未知公司", location: "", workType: "" },
  verdict: {
    label: "谨慎",
    headline: "岗位信息不足，先别急着冲。",
    summary: "截图里可判断的信息有限，建议补充完整 JD 后再做最终判断。",
    overallScore: 5,
    costPerformance: "C",
    fitScore: 0
  },
  translations: [],
  risks: [],
  upsides: [],
  salaryLogic: { metrics: [], summary: "" },
  dayTimeline: [],
  recommendation: { fits: [], avoidIf: [], finalAdvice: "" },
  resumeMatch: { enabled: false, advantages: [], gaps: [], rewriteTips: [], applyStrategy: "谨慎投", skills: [] },
  scores: { technicalDepth: 0, growth: 0, blameRisk: 0, mobility: 0, entryFriendly: 0 }
};

function App() {
  const [apiKeys, setApiKeys] = useState(loadApiKeys);
  const [activeProviderId, setActiveProviderId] = useState(loadActiveProvider);
  const [history, setHistory] = useState(loadReports);
  const [imageFile, setImageFile] = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [resumeEnabled, setResumeEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [activeReport, setActiveReport] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeProvider = PROVIDERS[activeProviderId] || PROVIDERS.gemini;
  const hasKey = Boolean(apiKeys[activeProvider.id]?.trim());

  useEffect(() => {
    const onPaste = async (event) => {
      const file = getImageFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      await setImage(file, { setImageFile, setImageDataUrl, setError });
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const selectProvider = (providerId) => {
    if (!PROVIDERS[providerId]) return;
    setActiveProviderId(providerId);
    localStorage.setItem(ACTIVE_PROVIDER_STORAGE, providerId);
    setError("");
  };

  const saveKey = (providerId, key, options = {}) => {
    const next = { ...apiKeys, [providerId]: key.trim() };
    if (providerId === "qwen") {
      next.qwenEndpoint = normalizeQwenEndpoint(options.qwenEndpoint || apiKeys.qwenEndpoint);
    }
    setApiKeys(next);
    localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(next));
  };

  const clearKey = (providerId) => {
    const next = { ...apiKeys, [providerId]: "" };
    if (providerId === "qwen") next.qwenEndpoint = normalizeQwenEndpoint(apiKeys.qwenEndpoint);
    setApiKeys(next);
    localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(next));
  };

  const openHistoryReport = (item) => {
    setError("");
    setActiveReport(normalizeReport(item.reportJson));
  };

  const requestDeleteHistoryReport = (item) => {
    setDeleteTarget(item);
  };

  const confirmDeleteHistoryReport = () => {
    if (!deleteTarget) return;
    const next = deleteReport(deleteTarget.id);
    setHistory(next);
    setError("");
    setDeleteTarget(null);
  };

  const analyze = async () => {
    if (!hasKey) {
      setError("");
      setSettingsOpen(true);
      return;
    }

    if (!imageFile || !imageDataUrl) {
      setError("先上传或粘贴一张岗位截图。");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const report = await requestReport({
        provider: activeProvider,
        apiKey: apiKeys[activeProvider.id],
        qwenEndpoint: apiKeys.qwenEndpoint,
        imageFile,
        imageDataUrl,
        resumeText: resumeEnabled ? resumeText : ""
      });
      const normalized = normalizeReport(report);
      const nextHistory = saveReport(normalized, {
        provider: activeProvider.id,
        model: activeProvider.model
      });
      setHistory(nextHistory);
      setActiveReport(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const clearInputs = () => {
    setImageFile(null);
    setImageDataUrl("");
    setResumeText("");
    setResumeName("");
    setResumeEnabled(false);
    setError("");
  };

  return (
    <main className="app-shell">
      <div className="phone-frame">
        {activeReport ? (
          <ReportScreen
            report={activeReport}
            onBack={() => setActiveReport(null)}
            onTip={() => setTipOpen(true)}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <InputScreen
            imageFile={imageFile}
            imageDataUrl={imageDataUrl}
            resumeText={resumeText}
            resumeName={resumeName}
            resumeEnabled={resumeEnabled}
            loading={loading}
            error={error}
            hasKey={hasKey}
            activeProvider={activeProvider}
            history={history}
            onImage={(file) => setImage(file, { setImageFile, setImageDataUrl, setError })}
            onResumeText={setResumeText}
            onResumeName={setResumeName}
            onResumeEnabled={setResumeEnabled}
            onAnalyze={analyze}
            onClear={clearInputs}
            onOpenHistory={openHistoryReport}
            onDeleteHistory={requestDeleteHistoryReport}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
        <FloatingDock
          activeProviderId={activeProvider.id}
          apiKeys={apiKeys}
          hasKey={hasKey}
          onSelect={selectProvider}
          onSettings={() => setSettingsOpen(true)}
        />
        {settingsOpen && (
          <SettingsSheet
            apiKeys={apiKeys}
            activeProviderId={activeProvider.id}
            onProvider={selectProvider}
            onSave={saveKey}
            onClear={clearKey}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {deleteTarget && (
          <DeleteConfirmDialog
            item={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={confirmDeleteHistoryReport}
          />
        )}
        {tipOpen && <TipSheet onClose={() => setTipOpen(false)} />}
      </div>
    </main>
  );
}

function InputScreen({
  imageFile,
  imageDataUrl,
  resumeText,
  resumeName,
  resumeEnabled,
  loading,
  error,
  hasKey,
  activeProvider,
  history,
  onImage,
  onResumeText,
  onResumeName,
  onResumeEnabled,
  onAnalyze,
  onClear,
  onOpenHistory,
  onDeleteHistory,
  onSettings
}) {
  const imageInputRef = useRef(null);
  const resumeInputRef = useRef(null);
  const canAnalyze = Boolean(imageFile && imageDataUrl) && !loading;
  const hasResume = Boolean(resumeText.trim());
  const resumeStatus = resumeEnabled ? (hasResume ? "已启用" : "待上传") : "已关闭";
  const resumeHint = hasResume
    ? `${resumeName || "已上传简历"} · ${resumeEnabled ? "已匹配" : "已暂停"}`
    : resumeEnabled
      ? "点击“粘贴简历”上传 .md / .txt"
      : "简历不会参与本次分析";

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (file) await onImage(file);
    event.target.value = "";
  };

  const handleResumeChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    if (!isResumeTextFile(file)) {
      onResumeName("");
      return;
    }

    if (file.size > 768 * 1024) {
      onResumeName("");
      return;
    }

    onResumeName(file.name);
    onResumeText(await file.text());
    onResumeEnabled(true);
  };

  const toggleResume = () => {
    const next = !resumeEnabled;
    onResumeEnabled(next);
    if (next && !resumeText.trim()) {
      resumeInputRef.current?.click();
    }
  };

  return (
    <section className="screen input-screen">
      <header className="topbar">
        <div className="brand">
          <div className="logo-mark">
            <IconScan size={18} />
          </div>
          <div>
            <strong>JD-Ray</strong>
            <span>JOB X-RAY · LOCAL</span>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={onSettings} aria-label="模型设置">
          <IconKey size={18} />
        </button>
      </header>

      <section className="hero-copy">
        <h1>
          看穿这份 JD,
          <br />
          <span>再决定要不要投。</span>
        </h1>
        <p>上传岗位截图，JD-Ray 会把招聘黑话翻译成人话，并给出投递风险、成长性和简历匹配建议。</p>
      </section>

      <input
        ref={imageInputRef}
        className="hidden-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleImageChange}
      />
      <DropZone
        file={imageFile}
        dataUrl={imageDataUrl}
        loading={loading}
        onClick={() => imageInputRef.current?.click()}
        onDropImage={onImage}
      />

      <div className="divider">
        <span />
        <small>或</small>
        <span />
      </div>

      <div className="quick-actions">
        <button type="button" onClick={() => imageInputRef.current?.click()}>
          <IconUpload size={16} />
          上传截图
        </button>
        <button type="button" onClick={() => resumeInputRef.current?.click()}>
          <IconFile size={16} />
          粘贴简历
        </button>
      </div>

      <section className="glass-card resume-card">
        <div className="card-icon">
          <IconBriefcase size={20} />
        </div>
        <div className="resume-body">
          <div className="resume-title-row">
            <strong>同步我的简历</strong>
            <span className={resumeEnabled ? "status good" : "status muted"}>
              {resumeStatus}
            </span>
          </div>
          <p>{resumeHint}</p>
        </div>
        <button
          className={`toggle-switch ${resumeEnabled ? "on" : ""}`}
          type="button"
          role="switch"
          aria-checked={resumeEnabled}
          onClick={toggleResume}
        >
          <span />
        </button>
        <input
          ref={resumeInputRef}
          className="hidden-input"
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          onChange={handleResumeChange}
        />
      </section>

      {error && (
        <div className="notice error">
          <IconAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {!hasKey && (
        <button className="key-status" type="button" onClick={onSettings}>
          <span className="key-status-icon">
            <IconKey size={15} />
          </span>
          <span className="key-status-copy">
            <strong>{activeProvider.keyLabel} 未配置</strong>
            <small>配置后才能调用 {activeProvider.displayName}</small>
          </span>
          <span className="key-status-action">设置</span>
        </button>
      )}

      <div className="actions">
        <button className="primary-button" type="button" disabled={!canAnalyze} onClick={onAnalyze}>
          {loading ? <span className="spinner" /> : <IconSparkle size={18} />}
          {loading ? "正在透视岗位..." : "生成深度透视报告"}
          {!loading && <IconArrowRight size={18} />}
        </button>
        <button className="ghost-button" type="button" onClick={onClear}>
          清空
        </button>
      </div>

      <section className="recent-section">
        <div className="section-title">
          <span>最近分析</span>
          <small>本机历史</small>
        </div>
        {history.length ? (
          <div className="recent-list">
            {history.slice(0, 6).map((item) => (
              <RecentItem
                key={item.id}
                item={item}
                onClick={() => onOpenHistory(item)}
                onDelete={() => onDeleteHistory(item)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-recent">还没有历史报告。第一份 JD 会保存在本机，最多保留 20 条。</div>
        )}
      </section>
    </section>
  );
}

function DropZone({ file, dataUrl, loading, onClick, onDropImage }) {
  const hasFile = Boolean(file && dataUrl);

  const onDrop = async (event) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) await onDropImage(dropped);
  };

  return (
    <button
      className={`drop-zone ${hasFile ? "has-file" : ""} ${loading ? "scanning" : ""}`}
      type="button"
      onClick={onClick}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
      {loading && <span className="scanline" />}
      {!hasFile ? (
        <>
          <span className="upload-badge">
            <IconUpload size={28} />
          </span>
          <strong>拖拽、点击上传或直接粘贴 JD 截图</strong>
          <small>PNG · JPG · WEBP · 最大 12MB</small>
        </>
      ) : (
        <>
          <div className="preview-frame">
            <img src={dataUrl} alt="岗位截图预览" />
          </div>
          <span className="file-meta">
            {loading ? <span className="pulse" /> : <IconCheck size={14} />}
            {loading ? "OCR · 拆黑话 · 评估风险中" : `${file.name} · ${formatBytes(file.size)}`}
          </span>
        </>
      )}
    </button>
  );
}

function RecentItem({ item, onClick, onDelete }) {
  const verdict = verdictTone(item.verdict?.label);
  const title = item.roleTitle || item.reportJson?.meta?.roleTitle || "未命名岗位";
  const company = item.company || item.reportJson?.meta?.company || "未知公司";
  const provider = PROVIDERS[item.provider];

  return (
    <div className="recent-item">
      <button className="recent-open" type="button" onClick={onClick}>
        <span className="recent-avatar">{title.slice(0, 1) || "岗"}</span>
        <span className="recent-main">
          <strong>{title}</strong>
          <small>
            {company} · {provider ? `${provider.historyLabel} · ` : ""}{relativeTime(item.createdAt)}
          </small>
        </span>
        <span className={`verdict-pill ${verdict.className}`}>{item.verdict?.label || "谨慎"}</span>
      </button>
      <button className="recent-delete" type="button" onClick={onDelete} aria-label={`删除 ${title} 的历史报告`}>
        <IconTrash size={15} />
      </button>
    </div>
  );
}

function ReportScreen({ report, onBack, onTip }) {
  const data = normalizeReport(report);
  const verdict = verdictTone(data.verdict.label);
  const markdown = useMemo(() => reportToMarkdown(data), [data]);

  const copyReport = async () => {
    await navigator.clipboard.writeText(markdown);
  };

  return (
    <section className="screen report-screen">
      <header className="report-topbar">
        <button className="icon-button" type="button" onClick={onBack} aria-label="返回">
          <IconArrowLeft size={18} />
        </button>
        <span>报告 · {shortId(data.meta.roleTitle)}</span>
        <button className="icon-button" type="button" onClick={copyReport} aria-label="复制报告">
          <IconCopy size={17} />
        </button>
      </header>

      <section className="role-head">
        <div className="role-meta">
          <span>{data.meta.company || "未知公司"}</span>
          {data.meta.location && <i />}
          {data.meta.location && <span>{data.meta.location}</span>}
          {data.meta.workType && <i />}
          {data.meta.workType && <span className="accent">{data.meta.workType}</span>}
        </div>
        <h1>{data.meta.roleTitle || "未知岗位"}</h1>
      </section>

      <section className={`verdict-card ${verdict.className}`}>
        <small>最终结论</small>
        <h2>{data.verdict.label}</h2>
        <h3>{data.verdict.headline}</h3>
        <p>{data.verdict.summary}</p>
        <div className="score-grid">
          <ScoreChip label="综合评分" value={formatScore(data.verdict.overallScore)} suffix="/10" tone={verdict.className} />
          <ScoreChip label="性价比" value={data.verdict.costPerformance || "C"} tone={verdict.className} />
          <ScoreChip label="契合度" value={`${safeNumber(data.verdict.fitScore)}%`} tone="good" />
        </div>
      </section>

      <ReportSection icon={<IconSparkle size={15} />} code="01 · 黑话翻译" title="说人话">
        <div className="truth-list">
          {ensureList(data.translations, fallbackTranslations).slice(0, 5).map((item, index) => (
            <div className="truth-row" key={`${item.jargon}-${index}`}>
              <blockquote>{item.jargon || "JD 话术"}</blockquote>
              <p>
                <IconArrowRight size={14} />
                <span>{item.truth || "信息不足，无法判断真实落地方式。"}</span>
              </p>
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection icon={<IconAlert size={15} />} code="02 · 风险与收益" title="真实信号">
        <div className="risk-grid">
          <SignalColumn type="bad" title="红色警报" items={ensureList(data.risks, fallbackRisks)} />
          <SignalColumn type="good" title="绿灯信号" items={ensureList(data.upsides, fallbackUpsides)} />
        </div>
      </ReportSection>

      <ReportSection icon={<IconCoin size={15} />} code="03 · 薪资逻辑" title="钱买的是什么">
        <div className="metric-grid">
          {ensureList(data.salaryLogic.metrics, fallbackMetrics).slice(0, 4).map((item, index) => (
            <MetricCard key={`${item.label}-${index}`} item={item} />
          ))}
        </div>
        <p className="section-summary">{data.salaryLogic.summary || "薪资信号不足，建议面试时追问绩效、交付边界和值班安排。"}</p>
      </ReportSection>

      <ReportSection icon={<IconClock size={15} />} code="04 · 一日实况" title="这份工作的周二">
        <Timeline items={ensureList(data.dayTimeline, fallbackTimeline)} />
      </ReportSection>

      <ReportSection icon={<IconTarget size={15} />} code="05 · 最终建议" title="谁适合，谁快跑">
        <AdviceBlock recommendation={data.recommendation} />
      </ReportSection>

      {data.resumeMatch.enabled && (
        <ReportSection icon={<IconBriefcase size={15} />} code="06 · 简历匹配" title="你和岗位的距离">
          <ResumeMatch match={data.resumeMatch} />
        </ReportSection>
      )}

      <ReportSection icon={<IconScan size={15} />} code="07 · 五维评分" title="岗位雷达">
        <ScoreBars scores={data.scores} />
      </ReportSection>

      <SupportCard onOpen={onTip} />

      <div className="bottom-spacer" />
    </section>
  );
}

function ReportSection({ icon, code, title, children }) {
  return (
    <section className="report-section">
      <div className="report-section-head">
        <span className="section-icon">{icon}</span>
        <div>
          <small>{code}</small>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function SupportCard({ onOpen }) {
  return (
    <section className="support-card" aria-label="打赏支持">
      <span className="support-icon">
        <IconHeart size={18} />
      </span>
      <div className="support-copy">
        <strong>这份报告帮到你了吗？</strong>
        <p>请作者喝杯咖啡 · 随心支持</p>
      </div>
      <button className="support-button" type="button" onClick={onOpen}>
        支持一下
      </button>
    </section>
  );
}

function TipSheet({ onClose }) {
  const pressTimerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState("");

  useEffect(() => {
    return () => window.clearTimeout(pressTimerRef.current);
  }, []);

  const clearLongPress = () => {
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  const openMenu = () => {
    clearLongPress();
    setScanNotice("");
    setMenuOpen(true);
    navigator.vibrate?.(18);
  };

  const startLongPress = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearLongPress();
    pressTimerRef.current = window.setTimeout(openMenu, 700);
  };

  const recognizeAndOpen = async () => {
    setMenuOpen(false);
    setScanning(true);
    setScanNotice("正在识别二维码...");

    try {
      const qrText = await decodeQrFromImage(alipayQrUrl);
      setScanNotice("正在跳转到支付宝...");
      openAlipayQr(qrText);
      window.setTimeout(() => setScanning(false), 1600);
    } catch (error) {
      setScanning(false);
      setScanNotice(error instanceof Error ? error.message : "识别失败，请保存图片后在支付宝相册识别。");
    }
  };

  const saveImage = () => {
    setMenuOpen(false);
    downloadImage(alipayQrUrl, "jd-ray-alipay-qr.jpg");
    setScanNotice("已请求保存图片。");
  };

  return (
    <div className="tip-sheet-backdrop" onClick={onClose}>
      <section className="tip-sheet" onClick={(event) => event.stopPropagation()} aria-label="支付宝打赏">
        <div className="sheet-grip" />
        <header className="tip-sheet-head">
          <div>
            <h2>
              <IconCup size={16} />
              请作者喝杯咖啡
            </h2>
            <p>打开支付宝扫一扫支持</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭打赏弹窗">
            <IconX size={17} />
          </button>
        </header>

        <div className={`pay-card ${menuOpen ? "menu-open" : ""}`}>
          <div
            className={`pay-qr-frame ${scanning ? "scanning" : ""}`}
            onPointerDown={startLongPress}
            onPointerUp={clearLongPress}
            onPointerCancel={clearLongPress}
            onPointerLeave={clearLongPress}
            onContextMenu={(event) => {
              event.preventDefault();
              openMenu();
            }}
            role="button"
            tabIndex={0}
            aria-label="长按识别支付宝二维码"
          >
            <img src={alipayQrUrl} alt="支付宝收款二维码" draggable="false" />
          </div>
          <strong>支付宝</strong>
          <span>JD-Ray · 扫一扫付款</span>
          <div className="qr-hint">
            <i />
            长按图片识别二维码
          </div>

          {scanNotice && <div className="scan-toast">{scanNotice}</div>}

          {menuOpen && (
            <div className="qr-menu" role="menu">
              <button className="primary" type="button" onClick={recognizeAndOpen}>
                <IconScan size={16} />
                识别二维码 · 跳转支付宝
              </button>
              <button type="button" onClick={saveImage}>
                <IconImage size={16} />
                保存图片
              </button>
              <button className="muted" type="button" onClick={() => setMenuOpen(false)}>
                <IconX size={16} />
                取消
              </button>
            </div>
          )}
        </div>

        <p className="tip-note">金额随意，感谢你让 JD-Ray 继续保持独立。</p>
      </section>
    </div>
  );
}

function ScoreChip({ label, value, suffix = "", tone = "warn" }) {
  return (
    <div className="score-chip">
      <small>{label}</small>
      <strong className={tone}>
        {value}
        {suffix && <span>{suffix}</span>}
      </strong>
    </div>
  );
}

function SignalColumn({ type, title, items }) {
  return (
    <div className={`signal-column ${type}`}>
      <div className="signal-title">
        <strong>{title}</strong>
        <span>×{items.slice(0, 4).length}</span>
      </div>
      {items.slice(0, 4).map((item, index) => (
        <div className="signal-row" key={`${item.title}-${index}`}>
          <span>{type === "good" ? <IconCheck size={12} /> : <IconX size={12} />}</span>
          <p>
            <strong>{item.title || "信号不足"}</strong>
            <small>{item.evidence || "图片中没有足够证据，需要面试追问。"}</small>
          </p>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ item }) {
  const tone = toneClass(item.tone);
  return (
    <div className="metric-card">
      <small>{item.label || "指标"}</small>
      <strong className={tone}>{item.value || "-"}</strong>
      <span>{item.note || "待确认"}</span>
    </div>
  );
}

function Timeline({ items }) {
  return (
    <div className="timeline">
      {items.slice(0, 8).map((item, index) => (
        <div className="timeline-row" key={`${item.time}-${index}`}>
          <time>{item.time || "09:30"}</time>
          <i className={toneClass(item.tone)} />
          <p>
            <strong>{item.title || "处理临时需求"}</strong>
            <small>{item.duration || "不定"}</small>
          </p>
        </div>
      ))}
    </div>
  );
}

function AdviceBlock({ recommendation }) {
  const fits = ensureList(recommendation?.fits, ["想用 AI 岗位做转型跳板的人。"]);
  const avoidIf = ensureList(recommendation?.avoidIf, ["期待纯研究或底层模型训练的人。"]);

  return (
    <div className="advice-grid">
      <div className="advice-card good">
        <strong>适合谁</strong>
        {fits.slice(0, 4).map((item, index) => (
          <p key={index}>{item}</p>
        ))}
      </div>
      <div className="advice-card bad">
        <strong>谁该快跑</strong>
        {avoidIf.slice(0, 4).map((item, index) => (
          <p key={index}>{item}</p>
        ))}
      </div>
      <div className="final-advice">{recommendation?.finalAdvice || "先确认职责边界、技术栈和交付指标，再决定是否投递。"}</div>
    </div>
  );
}

function ResumeMatch({ match }) {
  return (
    <div className="resume-match">
      <div className="strategy-row">
        <span>投递策略</span>
        <strong>{match.applyStrategy || "谨慎投"}</strong>
      </div>
      {ensureList(match.skills, []).slice(0, 6).map((skill, index) => {
        const pct = clampNumber(skill.match, 0, 100);
        return (
          <div className="skill-row" key={`${skill.name}-${index}`}>
            <div>
              <span>{skill.name || "岗位技能"}</span>
              <strong>{pct}%</strong>
            </div>
            <i>
              <b style={{ width: `${pct}%` }} />
            </i>
          </div>
        );
      })}
      <MiniList title="优势" items={match.advantages} />
      <MiniList title="差距" items={match.gaps} />
      <MiniList title="改写方向" items={match.rewriteTips} />
    </div>
  );
}

function MiniList({ title, items }) {
  const list = ensureList(items, []);
  if (!list.length) return null;
  return (
    <div className="mini-list">
      <strong>{title}</strong>
      {list.slice(0, 4).map((item, index) => (
        <p key={index}>{item}</p>
      ))}
    </div>
  );
}

function ScoreBars({ scores }) {
  const rows = [
    ["technicalDepth", "技术含量"],
    ["growth", "成长性"],
    ["blameRisk", "背锅指数"],
    ["mobility", "跳槽迁移性"],
    ["entryFriendly", "入门友好"]
  ];

  return (
    <div className="score-bars">
      {rows.map(([key, label]) => {
        const value = clampNumber(scores?.[key], 0, 5);
        return (
          <div className="score-bar" key={key}>
            <div>
              <span>{label}</span>
              <strong>{value}/5</strong>
            </div>
            <i>
              <b style={{ width: `${(value / 5) * 100}%` }} />
            </i>
          </div>
        );
      })}
    </div>
  );
}

function FloatingDock({ activeProviderId, apiKeys, hasKey, onSelect, onSettings }) {
  return (
    <nav className="floating-dock" aria-label="模型选择">
      {Object.values(PROVIDERS).map((provider) => {
        const configured = Boolean(apiKeys[provider.id]?.trim());
        const active = activeProviderId === provider.id;
        return (
          <button
            key={provider.id}
            className={`dock-chip ${active ? "active" : ""} ${configured ? "ready" : ""}`}
            type="button"
            onClick={() => onSelect(provider.id)}
            aria-pressed={active}
          >
            <i />
            {provider.dockLabel} <small>{provider.dockMeta}</small>
          </button>
        );
      })}
      <button className={hasKey ? "key-button active" : "key-button"} type="button" onClick={onSettings} aria-label="API Key 设置">
        <IconKey size={16} />
      </button>
    </nav>
  );
}

function SettingsSheet({ apiKeys, activeProviderId, onProvider, onSave, onClear, onClose }) {
  const [selectedProviderId, setSelectedProviderId] = useState(activeProviderId);
  const selectedProvider = PROVIDERS[selectedProviderId] || PROVIDERS.gemini;
  const [draft, setDraft] = useState(apiKeys[selectedProvider.id] || "");
  const [endpointDraft, setEndpointDraft] = useState(normalizeQwenEndpoint(apiKeys.qwenEndpoint));
  const [show, setShow] = useState(false);
  const hasValue = Boolean(apiKeys[selectedProvider.id]);

  useEffect(() => {
    setDraft(apiKeys[selectedProvider.id] || "");
    setEndpointDraft(normalizeQwenEndpoint(apiKeys.qwenEndpoint));
    setShow(false);
  }, [apiKeys, selectedProvider.id]);

  const selectProvider = (providerId) => {
    setSelectedProviderId(providerId);
    onProvider(providerId);
  };

  const save = () => {
    onSave(selectedProvider.id, draft, { qwenEndpoint: endpointDraft });
    onClose();
  };

  const clear = () => {
    onClear(selectedProvider.id);
    setDraft("");
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="settings-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-grip" />
        <header>
          <div>
            <h2>模型设置</h2>
            <p>使用你自己的模型 API Key，密钥仅保存在本机浏览器。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <IconX size={16} />
          </button>
        </header>

        <div className="key-rows provider-rows">
          {Object.values(PROVIDERS).map((provider) => {
            const configured = Boolean(apiKeys[provider.id]?.trim());
            return (
              <button
                className={`key-row ${selectedProvider.id === provider.id ? "active" : ""}`}
                type="button"
                key={provider.id}
                onClick={() => selectProvider(provider.id)}
              >
                <span>{provider.displayName}</span>
                <strong>{configured ? "已启用" : "待配置"}</strong>
              </button>
            );
          })}
        </div>

        <label className="key-field">
          <span>{selectedProvider.vendor} · {selectedProvider.displayName}</span>
          <div>
            <input
              type={show ? "text" : "password"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={selectedProvider.placeholder}
              autoComplete="off"
              spellCheck="false"
            />
            <button type="button" onClick={() => setShow((next) => !next)}>
              {show ? "隐藏" : "显示"}
            </button>
          </div>
          <small>{hasValue ? `当前：${maskKey(apiKeys[selectedProvider.id])}` : `未配置：无法调用 ${selectedProvider.displayName}`}</small>
        </label>

        {selectedProvider.id === "qwen" && (
          <div className="endpoint-field">
            <span>DashScope 区域</span>
            <div>
              {QWEN_ENDPOINTS.map((endpoint) => (
                <button
                  className={endpointDraft === endpoint.value ? "active" : ""}
                  key={endpoint.id}
                  type="button"
                  onClick={() => setEndpointDraft(endpoint.value)}
                >
                  {endpoint.label}
                </button>
              ))}
            </div>
            <small>{endpointDraft}</small>
          </div>
        )}

        <div className="privacy-note">
          <IconShield size={16} />
          <span>Key、历史报告只存在本机 localStorage；不上传到任何 JD-Ray 服务器。</span>
        </div>

        <div className="sheet-actions">
          <button className="ghost-button" type="button" onClick={clear}>
            清除 Key
          </button>
          <button className="primary-button small" type="button" onClick={save} disabled={!draft.trim()}>
            保存
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteConfirmDialog({ item, onCancel, onConfirm }) {
  const title = item.roleTitle || item.reportJson?.meta?.roleTitle || "这条报告";
  const company = item.company || item.reportJson?.meta?.company || "未知公司";

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-icon danger">
          <IconTrash size={20} />
        </div>
        <div className="confirm-copy">
          <small>本机历史</small>
          <h2 id="delete-dialog-title">删除这条分析？</h2>
          <p>
            <strong>{title}</strong>
            <span>{company} · 只会移除本机 localStorage 里的报告记录。</span>
          </p>
        </div>
        <div className="confirm-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="danger-button" type="button" onClick={onConfirm}>
            删除
          </button>
        </div>
      </section>
    </div>
  );
}

async function requestReport({ provider, apiKey, qwenEndpoint, imageFile, imageDataUrl, resumeText }) {
  if (provider.id === "qwen") {
    return requestQwenReport({ apiKey, qwenEndpoint, imageDataUrl, resumeText });
  }
  return requestGeminiReport({ apiKey, imageFile, imageDataUrl, resumeText });
}

async function requestGeminiReport({ apiKey, imageFile, imageDataUrl, resumeText }) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt({ hasResume: Boolean(resumeText.trim()) }) },
            ...(resumeText.trim()
              ? [
                  {
                    text: `候选人的 Markdown 简历如下。只用于岗位匹配、差距和投递策略，不要复述隐私字段。\n\n${resumeText.trim().slice(0, 18000)}`
                  }
                ]
              : []),
            {
              inline_data: {
                mime_type: imageFile.type || "image/jpeg",
                data: stripDataUrl(imageDataUrl)
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.55,
        topP: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini API 调用失败：HTTP ${response.status}`);
  }

  const finishReason = payload?.candidates?.[0]?.finishReason;
  const text = extractText(payload);
  if (!text) {
    throw new Error("Gemini 没有返回可解析内容。");
  }

  try {
    return parseJsonText(text);
  } catch (err) {
    if (finishReason === "MAX_TOKENS") {
      throw new Error("模型输出被截断，JSON 没闭合。请重试，或删减简历后再分析。");
    }
    throw new Error(`Gemini 返回内容不是合法 JSON：${err.message}`);
  }
}

async function requestQwenReport({ apiKey, qwenEndpoint, imageDataUrl, resumeText }) {
  let response;
  const endpoint = `${normalizeQwenEndpoint(qwenEndpoint)}/chat/completions`;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt({ hasResume: Boolean(resumeText.trim()) }) },
              ...(resumeText.trim()
                ? [
                    {
                      type: "text",
                      text: `候选人的 Markdown 简历如下。只用于岗位匹配、差距和投递策略，不要复述隐私字段。\n\n${resumeText.trim().slice(0, 18000)}`
                    }
                  ]
                : []),
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        temperature: 0.45,
        top_p: 0.9,
        max_tokens: 8192,
        stream: false
      })
    });
  } catch (err) {
    throw new Error("Qwen API 无法直连，可能是网络、区域 Endpoint 或浏览器 CORS 限制。请切换区域或稍后重试。");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || payload.message || `Qwen API 调用失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  const finishReason = payload?.choices?.[0]?.finish_reason;
  const text = extractOpenAIText(payload);
  if (!text) {
    throw new Error("Qwen 没有返回可解析内容。");
  }

  try {
    return parseJsonText(text);
  } catch (err) {
    if (finishReason === "length") {
      throw new Error("Qwen 输出被截断，JSON 没闭合。请重试，或删减简历后再分析。");
    }
    throw new Error(`Qwen 返回内容不是合法 JSON：${err.message}`);
  }
}

function buildPrompt({ hasResume }) {
  return `你是 JD-Ray，一个“岗位真相分析器”。请先识别岗位截图中的职位标题、公司、地点、职责、要求、福利等信息，再输出中文结构化分析。

语气要求：
- 专业、犀利、克制，像资深技术负责人 + 职业顾问。
- 先给判断，再给证据；少讲概念，多讲真实日常、技术含量、背锅风险、迁移价值。
- 把 HR 话术翻译成人话，但不要为了毒舌而编造。
- 强判断必须基于截图证据；缺信息就写“无法判断”或“大概率”。
- 内容要精炼，每个数组控制 3-5 项，不要长篇作文。

请严格返回 JSON，不要 Markdown，不要代码块，不要解释文字。字段必须符合：
{
  "meta": {"roleTitle":"string","company":"string","location":"string","workType":"string"},
  "verdict": {"label":"推荐|谨慎|避雷","headline":"string","summary":"string","overallScore":0,"costPerformance":"A|B|C|D","fitScore":0},
  "translations": [{"jargon":"string","truth":"string"}],
  "risks": [{"title":"string","evidence":"string"}],
  "upsides": [{"title":"string","evidence":"string"}],
  "salaryLogic": {"metrics":[{"label":"string","value":"string","note":"string","tone":"good|warn|bad|neutral"}],"summary":"string"},
  "dayTimeline": [{"time":"09:30","title":"string","tone":"good|warn|bad|neutral","duration":"string"}],
  "recommendation": {"fits":["string"],"avoidIf":["string"],"finalAdvice":"string"},
  "resumeMatch": {"enabled":${hasResume},"advantages":["string"],"gaps":["string"],"rewriteTips":["string"],"applyStrategy":"冲|谨慎投|不建议投","skills":[{"name":"string","match":0}]},
  "scores": {"technicalDepth":0,"growth":0,"blameRisk":0,"mobility":0,"entryFriendly":0}
}

评分约束：
- overallScore 0-10；fitScore 0-100；skills.match 0-100。
- scores 五项为 0-5。blameRisk 分数越高表示背锅越重。
- label 只能是“推荐”“谨慎”“避雷”。

${hasResume ? "已提供简历，请输出 resumeMatch。" : "未提供简历，resumeMatch.enabled=false，其余数组可为空。"}
`;
}

async function setImage(file, { setImageFile, setImageDataUrl, setError }) {
  if (!file.type.startsWith("image/")) {
    setError("请上传图片文件。");
    return;
  }

  if (file.size > 12 * 1024 * 1024) {
    setError("图片超过 12MB，请压缩后再上传。");
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  setImageFile(file);
  setImageDataUrl(dataUrl);
  setError("");
}

function normalizeReport(input) {
  const report = deepMerge(emptyReport, input || {});
  report.verdict.label = ["推荐", "谨慎", "避雷"].includes(report.verdict.label) ? report.verdict.label : "谨慎";
  report.verdict.overallScore = clampNumber(report.verdict.overallScore, 0, 10);
  report.verdict.fitScore = clampNumber(report.verdict.fitScore, 0, 100);
  report.verdict.costPerformance = ["A", "B", "C", "D"].includes(report.verdict.costPerformance) ? report.verdict.costPerformance : "C";
  report.translations = ensureList(report.translations, []);
  report.risks = ensureList(report.risks, []);
  report.upsides = ensureList(report.upsides, []);
  report.salaryLogic.metrics = ensureList(report.salaryLogic.metrics, []);
  report.dayTimeline = ensureList(report.dayTimeline, []);
  report.recommendation.fits = ensureList(report.recommendation.fits, []);
  report.recommendation.avoidIf = ensureList(report.recommendation.avoidIf, []);
  report.resumeMatch.advantages = ensureList(report.resumeMatch.advantages, []);
  report.resumeMatch.gaps = ensureList(report.resumeMatch.gaps, []);
  report.resumeMatch.rewriteTips = ensureList(report.resumeMatch.rewriteTips, []);
  report.resumeMatch.skills = ensureList(report.resumeMatch.skills, []);
  return report;
}

function deepMerge(base, incoming) {
  if (incoming === undefined || incoming === null) return cloneValue(base);
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : [...base];
  if (!base || typeof base !== "object") return incoming ?? base;
  const output = { ...base };
  for (const key of Object.keys(base)) {
    if (incoming && Object.hasOwn(incoming, key)) output[key] = deepMerge(base[key], incoming[key]);
  }
  for (const key of Object.keys(incoming || {})) {
    if (!Object.hasOwn(output, key)) output[key] = incoming[key];
  }
  return output;
}

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

function saveReport(report, metadata = {}) {
  const item = {
    id: crypto.randomUUID?.() || `${Date.now()}`,
    createdAt: new Date().toISOString(),
    roleTitle: report.meta.roleTitle,
    company: report.meta.company,
    provider: metadata.provider || "gemini",
    model: metadata.model || GEMINI_MODEL,
    verdict: report.verdict,
    scoreSummary: {
      overallScore: report.verdict.overallScore,
      costPerformance: report.verdict.costPerformance,
      fitScore: report.verdict.fitScore
    },
    reportJson: report
  };
  const next = [item, ...loadReports()].slice(0, 20);
  localStorage.setItem(REPORTS_STORAGE, JSON.stringify(next));
  return next;
}

function deleteReport(id) {
  const next = loadReports().filter((item) => item.id !== id);
  localStorage.setItem(REPORTS_STORAGE, JSON.stringify(next));
  return next;
}

function loadApiKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(API_KEYS_STORAGE) || "{}") || {};
    return {
      ...parsed,
      qwenEndpoint: normalizeQwenEndpoint(parsed.qwenEndpoint)
    };
  } catch {
    return { qwenEndpoint: QWEN_DEFAULT_ENDPOINT };
  }
}

function loadActiveProvider() {
  try {
    const providerId = localStorage.getItem(ACTIVE_PROVIDER_STORAGE) || "gemini";
    return PROVIDERS[providerId] ? providerId : "gemini";
  } catch {
    return "gemini";
  }
}

function loadReports() {
  try {
    const items = JSON.parse(localStorage.getItem(REPORTS_STORAGE) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("").trim();
}

function extractOpenAIText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part.text || part.content || "").join("").trim();
  }
  return "";
}

function normalizeQwenEndpoint(value) {
  const endpoint = String(value || "").trim().replace(/\/+$/, "");
  return QWEN_ENDPOINTS.some((item) => item.value === endpoint) ? endpoint : QWEN_DEFAULT_ENDPOINT;
}

function parseJsonText(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("找不到 JSON 对象");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function reportToMarkdown(report) {
  const lines = [
    `# ${report.meta.roleTitle}`,
    "",
    `## 一句话结论`,
    `${report.verdict.label}：${report.verdict.headline}`,
    "",
    report.verdict.summary,
    "",
    "## 黑话翻译",
    ...ensureList(report.translations, []).map((item) => `- ${item.jargon} -> ${item.truth}`),
    "",
    "## 红旗",
    ...ensureList(report.risks, []).map((item) => `- ${item.title}：${item.evidence}`),
    "",
    "## 亮点",
    ...ensureList(report.upsides, []).map((item) => `- ${item.title}：${item.evidence}`),
    "",
    "## 最终建议",
    report.recommendation.finalAdvice || ""
  ];
  return lines.join("\n");
}

async function decodeQrFromImage(imageUrl) {
  const image = await loadImageElement(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) throw new Error("当前环境无法读取二维码图片。");

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth"
  });
  if (decoded?.data) return decoded.data;

  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const results = await detector.detect(image);
      if (results?.[0]?.rawValue) return results[0].rawValue;
    } catch {
      // Fall through to the user-facing error below.
    }
  }

  throw new Error("识别失败，请保存图片后在支付宝相册识别。");
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("二维码图片加载失败。"));
    image.src = src;
  });
}

function openAlipayQr(qrText) {
  const value = String(qrText || "").trim();
  if (!value) throw new Error("二维码内容为空。");

  if (window.JDNative?.openAlipay) {
    window.JDNative.openAlipay(value);
    return;
  }

  const encodedQr = encodeURIComponent(value);
  const alipayPath = `platformapi/startapp?saId=10000007&qrcode=${encodedQr}`;
  const deepLink = value.startsWith("alipays://") ? value : `alipays://${alipayPath}`;
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
    window.location.href = `intent://${alipayPath}#Intent;scheme=alipays;package=com.eg.android.AlipayGphone;end`;
    return;
  }

  window.location.href = deepLink;
}

function downloadImage(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function getImageFromClipboard(clipboardData) {
  const items = Array.from(clipboardData?.items || []);
  const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
  return imageItem?.getAsFile() || null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function stripDataUrl(dataUrl) {
  return String(dataUrl).replace(/^data:[^;]+;base64,/, "");
}

function isResumeTextFile(file) {
  const name = file.name.toLowerCase();
  return name.endsWith(".md") || name.endsWith(".txt") || file.type === "text/markdown" || file.type === "text/plain";
}

function ensureList(value, fallback) {
  return Array.isArray(value) && value.length ? value : fallback;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function safeNumber(value) {
  return clampNumber(value, 0, 100);
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function relativeTime(dateValue) {
  const diff = Date.now() - new Date(dateValue).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  return `${Math.floor(days / 7)}周前`;
}

function verdictTone(label) {
  if (label === "推荐") return { className: "good" };
  if (label === "避雷") return { className: "bad" };
  return { className: "warn" };
}

function toneClass(tone) {
  if (tone === "good") return "good";
  if (tone === "bad") return "bad";
  if (tone === "warn") return "warn";
  return "neutral";
}

function maskKey(key) {
  if (!key) return "未配置";
  if (key.length <= 10) return "••••••";
  return `${key.slice(0, 5)}••••••••${key.slice(-4)}`;
}

function shortId(text) {
  let hash = 0;
  for (const char of String(text || "JD-Ray")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(16).slice(0, 4).toUpperCase();
}

const fallbackTranslations = [
  { jargon: "岗位描述过于概括", truth: "截图信息不足，先按高风险通用岗处理，面试时追问真实交付物。" }
];
const fallbackRisks = [{ title: "信息不完整", evidence: "看不到完整职责、技术栈或汇报关系，暂时无法下重判断。" }];
const fallbackUpsides = [{ title: "可继续确认", evidence: "如果补充完整 JD，仍可能发现技术深度或业务资源亮点。" }];
const fallbackMetrics = [{ label: "薪资溢价", value: "待确认", note: "截图未提供薪资或绩效结构", tone: "neutral" }];
const fallbackTimeline = [
  { time: "09:30", title: "同步需求与优先级", tone: "neutral", duration: "30分" },
  { time: "10:30", title: "处理业务方临时问题", tone: "warn", duration: "90分" },
  { time: "14:00", title: "推进交付与验收", tone: "neutral", duration: "2小时" },
  { time: "17:30", title: "补文档、复盘、准备明天会议", tone: "warn", duration: "不定" }
];

function Icon({ children, size = 22, stroke = 1.7, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconUpload(props) {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </Icon>
  );
}

function IconScan(props) {
  return (
    <Icon {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M3 12h18" />
    </Icon>
  );
}

function IconKey(props) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.5 12.5 9.5-9.5" />
      <path d="m17 6 3 3" />
    </Icon>
  );
}

function IconFile(props) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </Icon>
  );
}

function IconBriefcase(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </Icon>
  );
}

function IconHeart(props) {
  return (
    <Icon {...props}>
      <path d="M19.5 12.5 12 20l-7.5-7.5a5 5 0 0 1 7.5-6.6 5 5 0 0 1 7.5 6.6Z" />
    </Icon>
  );
}

function IconCup(props) {
  return (
    <Icon {...props}>
      <path d="M5 8h10v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M15 9h2a2 2 0 0 1 0 4h-2" />
      <path d="M6 20h10" />
      <path d="M8 4v1" />
      <path d="M12 4v1" />
    </Icon>
  );
}

function IconSparkle(props) {
  return (
    <Icon {...props}>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="m16.3 16.3 2.1 2.1" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="m5.6 18.4 2.1-2.1" />
      <path d="m16.3 7.7 2.1-2.1" />
    </Icon>
  );
}

function IconArrowRight(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  );
}

function IconArrowLeft(props) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Icon>
  );
}

function IconCheck(props) {
  return (
    <Icon {...props}>
      <path d="m20 6-11 11-5-5" />
    </Icon>
  );
}

function IconX(props) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

function IconAlert(props) {
  return (
    <Icon {...props}>
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

function IconCoin(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9a2.5 2.5 0 0 0-2.3-1.5h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 1 0 5h-1A2.5 2.5 0 0 1 9.2 16" />
      <path d="M12 6v1.5" />
      <path d="M12 16.5V18" />
    </Icon>
  );
}

function IconClock(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

function IconTarget(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </Icon>
  );
}

function IconCopy(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

function IconImage(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L8 19" />
    </Icon>
  );
}

function IconShield(props) {
  return (
    <Icon {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </Icon>
  );
}

function IconTrash(props) {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icon>
  );
}

createRoot(document.getElementById("root")).render(<App />);
