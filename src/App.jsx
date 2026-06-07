import { useState, useRef, useEffect, useCallback } from "react";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#07080a", surface: "#0f1318", panel: "#141a22", border: "#1c2630",
  accent: "#39e0b0", accentDim: "#1faa80", blue: "#4da6ff",
  amber: "#f5a623", red: "#ff4d6d", text: "#ddeeff",
  muted: "#4a6070", mutedLight: "#7a9ab0",
};

// ─── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = "wga_users_v2";
function loadUsers() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function saveUsers(u) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); } catch {} }
function getUserHistory(uid) { return loadUsers()[uid]?.history || []; }
function saveRecord(uid, name, rec) {
  const u = loadUsers();
  if (!u[uid]) u[uid] = { name, history: [] };
  u[uid].history.unshift(rec);
  if (u[uid].history.length > 20) u[uid].history = u[uid].history.slice(0, 20);
  saveUsers(u);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toBase64(canvas) { return canvas.toDataURL("image/jpeg", 0.75).split(",")[1]; }
function formatTime(s) {
  return `${Math.floor(s/60).toString().padStart(2,"0")}:${Math.floor(s%60).toString().padStart(2,"0")}`;
}
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
}
function scoreDiff(cur, prev) {
  const d = cur - prev;
  if (d > 0) return { label: `+${d}`, color: C.accent };
  if (d < 0) return { label: `${d}`, color: C.red };
  return { label: "±0", color: C.muted };
}

// ─── AI prompt ────────────────────────────────────────────────────────────────
const buildPrompt = (frameCount, history) => {
  const hasHistory = history && history.length > 0;
  const historyBlock = hasHistory
    ? `\n【過去の測定履歴（最新${Math.min(history.length,3)}回）】\n${history.slice(0,3).map((h,i) =>
        `[${i+1}回前 ${formatDate(h.date)}] スコア:${h.score} 課題:${(h.issues||[]).map(x=>x.title).join("・")} 体操:${(h.exercises||[]).map(x=>x.name).join("・")}`
      ).join("\n")}\n前回の体操から進捗を考慮し難易度を上げるか別のアプローチを提案してください。progressフィールドに前回比コメントを記載してください。`
    : `\n初回測定です。基本的な改善体操を提案してください。progressフィールドはnullにしてください。`;

  return `あなたは理学療法士の専門家です。
添付された${frameCount}枚の歩行動画フレーム画像（時系列順）を分析し、歩行動作を評価してください。

【注意事項】
- カメラを横に動かしながら撮影している場合があります。各フレームの瞬間的な姿勢・関節角度・重心を中心に評価し、フレーム間の位置変化は歩行の評価に用いないでください。
- 全身が映っていないフレームは除外し、有効なフレームのみで判断してください。

【補助具・環境の検出】
- 杖（一本杖・四点杖・ロフストランドクラッチなど）、歩行器、シルバーカーなどを検出してください。
- ベビーカーは絶対に出力しないでください。高齢者が使用している手押し車・カートは必ず「シルバーカー」または「歩行器」と判定してください。
- 壁や廊下の手すりも検出してください。
- 補助具・手すりの使い方が適切か（荷重・高さ・グリップ位置）も評価してください。
- 体操提案は補助具の有無・種類に合わせた内容にしてください。
${historyBlock}

以下のJSON形式のみで回答してください（前置き・後置き・コードブロック記号なし）：
{
  "score": 数値(0-100),
  "summary": "総合評価（25文字以内）",
  "progress": "前回比コメント（初回はnull）",
  "aids": {
    "detected": ["補助具・手すり名。なければ空配列[]"],
    "usage": "使い方の評価。未使用はnull",
    "recommendation": "アドバイス。不要な場合はnull"
  },
  "gait": {
    "cadence": "歩行リズムの評価",
    "stride": "歩幅の評価",
    "posture": "体幹・姿勢の評価",
    "armSwing": "腕振りの評価",
    "footClearance": "足のクリアランス評価"
  },
  "issues": [
    { "title": "課題名", "detail": "詳細（50文字以内）", "severity": "high|medium|low" }
  ],
  "exercises": [
    { "name": "体操名", "target": "対象部位", "duration": "時間・回数", "steps": ["手順1","手順2","手順3"], "effect": "期待できる効果", "isNew": true }
  ],
  "lifestyle": ["アドバイス1","アドバイス2","アドバイス3"]
}`;
};

// ─── Sub components ───────────────────────────────────────────────────────────
function ScoreArc({ score }) {
  const size=160, cx=80, cy=80, r=62;
  const angle = -210 + (score/100)*240;
  const toRad = d => (d*Math.PI)/180;
  const arc = (a1,a2,rad) => {
    const x1=cx+rad*Math.cos(toRad(a1)), y1=cy+rad*Math.sin(toRad(a1));
    const x2=cx+rad*Math.cos(toRad(a2)), y2=cy+rad*Math.sin(toRad(a2));
    return `M ${x1} ${y1} A ${rad} ${rad} 0 ${a2-a1>180?1:0} 1 ${x2} ${y2}`;
  };
  const col = score>=75?C.accent:score>=50?C.amber:C.red;
  return (
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size}>
        <path d={arc(-210,30,r)} fill="none" stroke={C.border} strokeWidth={10} strokeLinecap="round"/>
        <path d={arc(-210,angle,r)} fill="none" stroke={col} strokeWidth={10} strokeLinecap="round" style={{transition:"all 1.4s cubic-bezier(.4,0,.2,1)"}}/>
        <circle cx={cx+r*Math.cos(toRad(angle))} cy={cy+r*Math.sin(toRad(angle))} r={6} fill={col} style={{transition:"all 1.4s",filter:`drop-shadow(0 0 6px ${col})`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:8}}>
        <span style={{fontSize:42,fontWeight:900,color:col,fontFamily:"'Space Mono',monospace",lineHeight:1}}>{score}</span>
        <span style={{fontSize:10,color:C.muted,letterSpacing:3}}>GAIT SCORE</span>
      </div>
    </div>
  );
}

function ScoreHistoryChart({ history }) {
  if (!history||history.length<2) return null;
  const items = [...history].reverse().slice(-8);
  const scores = items.map(h=>h.score);
  const minS=Math.max(0,Math.min(...scores)-10), maxS=Math.min(100,Math.max(...scores)+10);
  const cW=280,cH=80,pad=20;
  const pts = items.map((h,i)=>({
    x: pad+(i/(items.length-1))*(cW-pad*2),
    y: cH-pad-((h.score-minS)/(maxS-minS))*(cH-pad*2),
    score: h.score,
  }));
  const pathD = pts.map((p,i)=>`${i===0?"M":"L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${pts[pts.length-1].x} ${cH-pad} L ${pts[0].x} ${cH-pad} Z`;
  return (
    <div style={{marginTop:12}}>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8}}>スコア推移</div>
      <svg width="100%" viewBox={`0 0 ${cW} ${cH}`} style={{overflow:"visible"}}>
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity="0.3"/><stop offset="100%" stopColor={C.accent} stopOpacity="0"/></linearGradient></defs>
        <path d={areaD} fill="url(#g)"/>
        <path d={pathD} fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill={C.accent} stroke={C.bg} strokeWidth={2}/>
            <text x={p.x} y={p.y-8} textAnchor="middle" fontSize="10" fill={C.accent} fontFamily="monospace">{p.score}</text>
            {i===0&&<text x={p.x} y={cH-4} textAnchor="middle" fontSize="8" fill={C.muted}>最古</text>}
            {i===pts.length-1&&<text x={p.x} y={cH-4} textAnchor="middle" fontSize="8" fill={C.muted}>今回</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ComparePanel({ current, prev }) {
  if (!prev) return null;
  const diff = scoreDiff(current.score, prev.score);
  return (
    <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>前回との比較 — {formatDate(prev.date)}</div>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:14}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>前回</div><div style={{fontSize:28,fontWeight:900,color:C.mutedLight,fontFamily:"'Space Mono',monospace"}}>{prev.score}</div></div>
        <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:diff.color,fontFamily:"'Space Mono',monospace"}}>{diff.label}</div><div style={{fontSize:10,color:C.muted}}>変化</div></div>
        <div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>今回</div><div style={{fontSize:28,fontWeight:900,color:diff.color,fontFamily:"'Space Mono',monospace"}}>{current.score}</div></div>
      </div>
      {current.progress&&<div style={{background:C.surface,borderRadius:8,padding:"10px 12px",borderLeft:`3px solid ${C.blue}`,fontSize:12,color:C.text,lineHeight:1.7}}>💬 {current.progress}</div>}
    </div>
  );
}

function GaitMetricBar({ label, value, color }) {
  const pct = value==="良好"||value==="正常"||value==="自然"?85:value?.includes("やや")?60:value?.includes("不規則")||value?.includes("小さい")||value?.includes("少ない")?40:65;
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
        <span style={{color:C.mutedLight}}>{label}</span><span style={{color:C.text,fontWeight:600}}>{value}</span>
      </div>
      <div style={{height:4,background:C.border,borderRadius:2}}>
        <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:2,transition:"width 1s ease 0.3s"}}/>
      </div>
    </div>
  );
}

function SeverityDot({ s }) {
  const col=s==="high"?C.red:s==="medium"?C.amber:C.accent;
  return <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:col,marginRight:6,flexShrink:0,marginTop:5}}/>;
}

function ExerciseCard({ ex, idx }) {
  const [open,setOpen]=useState(false);
  const cols=[C.accent,C.blue,C.amber,"#c084fc","#f472b6"];
  const col=cols[idx%cols.length];
  return (
    <div onClick={()=>setOpen(!open)} style={{background:C.panel,border:`1px solid ${open?col+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.2s",boxShadow:open?`0 0 24px ${col}18`:"none",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,borderRadius:10,background:col+"1a",border:`1px solid ${col}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🏃</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontWeight:700,color:C.text,fontSize:14}}>{ex.name}</span>
            {ex.isNew===false&&<span style={{fontSize:9,background:C.amber+"22",color:C.amber,border:`1px solid ${C.amber}44`,borderRadius:100,padding:"1px 7px",fontWeight:700}}>継続</span>}
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{ex.target} ／ {ex.duration}</div>
        </div>
        <div style={{color:C.muted,fontSize:16,transform:open?"rotate(180deg)":"none",transition:"0.2s",flexShrink:0}}>▾</div>
      </div>
      {open&&(
        <div style={{marginTop:14,borderTop:`1px solid ${C.border}`,paddingTop:14}}>
          {ex.steps.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
              <span style={{minWidth:22,height:22,borderRadius:"50%",background:col+"22",color:col,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,flexShrink:0}}>{i+1}</span>
              <span style={{fontSize:13,color:C.text,lineHeight:1.6}}>{s}</span>
            </div>
          ))}
          <div style={{marginTop:10,padding:"8px 12px",background:col+"0f",borderRadius:8,borderLeft:`3px solid ${col}`,fontSize:12,color:col}}>💡 {ex.effect}</div>
        </div>
      )}
    </div>
  );
}

function FrameStrip({ frames, current, onSelect }) {
  return (
    <div style={{display:"flex",gap:6,overflowX:"auto",padding:"4px 0 8px"}}>
      {frames.map((f,i)=>(
        <div key={i} onClick={()=>onSelect(i)} style={{flexShrink:0,cursor:"pointer",border:`2px solid ${current===i?C.accent:C.border}`,borderRadius:6,overflow:"hidden",boxShadow:current===i?`0 0 12px ${C.accent}44`:"none",transition:"all 0.15s"}}>
          <img src={`data:image/jpeg;base64,${f.b64}`} alt={`f${i}`} style={{display:"block",width:72,height:48,objectFit:"cover"}}/>
          <div style={{textAlign:"center",fontSize:9,color:C.muted,padding:"2px 0",background:C.surface}}>{formatTime(f.time)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function WalkingVideoAnalyzer() {
  const [phase, setPhase] = useState("consent");
  const [checks, setChecks] = useState({c1:false,c2:false,c3:false,c4:false});
  const [users, setUsers] = useState({});
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);
  const [frames, setFrames] = useState([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("gait");
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Noto+Sans+JP:wght@400;700;900&display=swap";
    document.head.appendChild(l);
    // Print styles
    const style = document.createElement("style");
    style.innerHTML = `
      @media print {
        body { background: #fff !important; color: #000 !important; }
        button { display: none !important; }
        .no-print { display: none !important; }
        * { color: #000 !important; background: #fff !important; border-color: #ccc !important; box-shadow: none !important; }
        img { max-width: 100% !important; }
        @page { margin: 15mm; size: A4; }
      }
    `;
    document.head.appendChild(style);
    setUsers(loadUsers());
  }, []);

  const wrap = {minHeight:"100vh",background:C.bg,fontFamily:"'Noto Sans JP',sans-serif",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",padding:"0 16px 48px"};
  const maxW = {width:"100%",maxWidth:520};

  const handleFile = useCallback((file) => {
    if (!file) return;
    const ext = (file.name?.split(".").pop()||"").toLowerCase();
    const validExt = ["mp4","mov","webm","avi","m4v","3gp","mkv"].includes(ext);
    if (!file.type.startsWith("video/") && !validExt) { setError("動画ファイルを選択してください（MP4・MOV・WebMなど）"); return; }
    if (file.size > 200*1024*1024) { setError("ファイルサイズは200MB以下にしてください"); return; }
    setError(null);
    setVideoUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }, [handleFile]);

  const startAnalysis = async () => {
    if (!videoRef.current) return;
    setPhase("extracting"); setProgress(0); setError(null);
    try {
      const vid = document.createElement("video");
      vid.muted = true; vid.playsInline = true; vid.preload = "auto";
      vid.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px";
      document.body.appendChild(vid);
      try {
        vid.src = videoUrl;
        await new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error("メタデータ読み込みタイムアウト")), 15000);
          vid.onloadedmetadata = () => { clearTimeout(timer); res(); };
          vid.onerror = () => { clearTimeout(timer); rej(new Error(`動画の読み込みエラー: ${vid.error?.message||"不明"}`)); };
          vid.load();
        });
        const duration = vid.duration;
        if (!duration||!isFinite(duration)||duration<=0) throw new Error(`動画の長さを取得できません`);
        setProgressLabel("フレーム抽出中...");
        const FRAME_COUNT = 6;
        const extracted = [];
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const vw = vid.videoWidth||640, vh = vid.videoHeight||480;
        const w = Math.min(vw,512), fh = Math.round(w*(vh/vw));
        canvas.width=w; canvas.height=fh;
        for (let i=0; i<FRAME_COUNT; i++) {
          const t = (i/(FRAME_COUNT-1))*duration*0.85+duration*0.05;
          await new Promise(res => {
            const timer = setTimeout(res, 3000);
            vid.onseeked = () => { clearTimeout(timer); vid.onseeked=null; res(); };
            vid.currentTime = t;
          });
          await new Promise(r => setTimeout(r, 150));
          ctx.drawImage(vid, 0, 0, w, fh);
          extracted.push({ time:t, b64:toBase64(canvas), w, h:fh });
          setProgress(Math.round(((i+1)/FRAME_COUNT)*40));
        }
        if (extracted.length===0) throw new Error("フレームを抽出できませんでした");
        setFrames(extracted);
        setProgressLabel("AIが歩行を解析中...");
        setPhase("analyzing");
        const currentHistory = getUserHistory(userId);
        const imageContent = extracted.flatMap((f,i) => ([
          {type:"text",text:`【フレーム${i+1}/${extracted.length} — ${formatTime(f.time)}】`},
          {type:"image",source:{type:"base64",media_type:"image/jpeg",data:f.b64}},
        ]));
        imageContent.push({type:"text",text:buildPrompt(extracted.length,currentHistory)});
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST",
          headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
          body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:1500,messages:[{role:"user",content:imageContent}]}),
        });
        setProgress(90);
        const data = await resp.json();
        if (data.error) throw new Error(data.error.message||"APIエラー");
        const raw = (data.content||[]).map(b=>b.text||"").join("");
        const rawFixed = raw.replace(/ベビーカー/g, "シルバーカー"); const parsed = JSON.parse(rawFixed.replace(/```json|```/g,"").trim());
        setProgress(100);
        await new Promise(r=>setTimeout(r,300));
        const record={date:new Date().toISOString(),score:parsed.score,summary:parsed.summary,issues:parsed.issues,exercises:parsed.exercises};
        saveRecord(userId,userName,record);
        setUsers(loadUsers());
        setResult(parsed);
        const sh=getUserHistory(userId);
        setActiveTab(sh.length>1?"compare":"gait");
        setPhase("result");
      } finally {
        vid.src=""; document.body.removeChild(vid);
      }
    } catch(e) {
      console.error(e);
      setError("エラー: "+e.message);
      setPhase("upload");
    }
  };

  const restart = () => {
    setPhase("userSelect");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null); setFrames([]); setResult(null);
    setError(null); setProgress(0); setActiveTab("gait"); setCurrentFrame(0);
    setUsers(loadUsers());
  };

  // ── CONSENT ───────────────────────────────────────────────────────────────
  if (phase==="consent") {
    const allChecked = Object.values(checks).every(Boolean);
    const ITEMS = [
      {key:"c1",label:"撮影される本人（または法定代理人）の同意を得ています",note:"認知症・未成年の場合は家族・後見人などの代理同意が必要です",imp:true},
      {key:"c2",label:"動画に映った画像がAI解析のためAnthropicのサーバーに送信されることを理解しています",note:"Anthropicのプライバシーポリシーが適用されます",imp:true},
      {key:"c3",label:"取得した動画・解析結果は目的外に利用しません",note:"第三者への無断提供・SNSへの無断投稿などは行いません",imp:true},
      {key:"c4",label:"本アプリの解析結果は参考情報であり、医療診断の代替ではないことを理解しています",note:"強い不安がある場合は医療機関・理学療法士にご相談ください",imp:false},
    ];
    return (
      <div style={wrap}><div style={maxW}>
        <div style={{paddingTop:48,marginBottom:28,textAlign:"center"}}>
          <div style={{display:"inline-flex",gap:6,alignItems:"center",background:C.accent+"14",border:`1px solid ${C.accent}2a`,borderRadius:100,padding:"5px 14px",marginBottom:20,fontSize:10,color:C.accent,letterSpacing:3,fontWeight:700}}>🎬 VIDEO GAIT ANALYSIS</div>
          <h1 style={{fontSize:26,fontWeight:900,lineHeight:1.3,margin:0,color:C.text}}>ご利用前の<br/><span style={{color:C.accent}}>同意確認</span></h1>
          <p style={{color:C.muted,marginTop:12,fontSize:13,lineHeight:1.8}}>本アプリは歩行動画をAIで解析します。<br/>下記をご確認のうえ、すべてにチェックをお願いします。</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {ITEMS.map(({key,label,note,imp})=>{
            const checked=checks[key];
            return (
              <div key={key} onClick={()=>setChecks(p=>({...p,[key]:!p[key]}))} style={{display:"flex",gap:12,alignItems:"flex-start",background:checked?C.accent+"0a":C.surface,border:`1.5px solid ${checked?C.accent+"55":C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s"}}>
                <div style={{width:22,height:22,borderRadius:6,flexShrink:0,marginTop:1,border:`2px solid ${checked?C.accent:imp?C.amber+"88":C.muted}`,background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                  {checked&&<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5L4.5 8.5L11 1" stroke={C.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,lineHeight:1.5,color:C.text}}>{imp&&<span style={{color:C.amber,fontSize:10,marginRight:4}}>★</span>}{label}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4,lineHeight:1.6}}>{note}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:12,color:C.muted,lineHeight:1.7}}>
          📄 Anthropicのプライバシーポリシー：<a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" style={{color:C.accent,marginLeft:4}}>anthropic.com/privacy</a>
        </div>
        <button onClick={()=>allChecked&&setPhase("userSelect")} disabled={!allChecked} style={{width:"100%",padding:"15px",background:allChecked?`linear-gradient(135deg,${C.accent},${C.accentDim})`:C.border,border:"none",borderRadius:12,color:allChecked?C.bg:C.muted,fontSize:15,fontWeight:700,cursor:allChecked?"pointer":"not-allowed",transition:"all 0.2s",fontFamily:"'Noto Sans JP',sans-serif",boxShadow:allChecked?`0 4px 20px ${C.accent}33`:"none"}}>
          {allChecked?"同意して次へ →":`あと ${Object.values(checks).filter(v=>!v).length} 項目の確認が必要です`}
        </button>
        <div style={{textAlign:"center",marginTop:10,fontSize:11,color:C.muted}}>★ は特に重要な項目です</div>
      </div></div>
    );
  }

  // ── USER SELECT ───────────────────────────────────────────────────────────
  if (phase==="userSelect") {
    const userList=Object.entries(users);
    const selectExisting=(uid)=>{setUserId(uid);setUserName(users[uid].name);setPhase("upload");};
    const addNew=()=>{
      if(!nameInput.trim()) return;
      const uid="u_"+Date.now();
      setUserId(uid);setUserName(nameInput.trim());setNameInput("");setPhase("upload");
    };
    return (
      <div style={wrap}><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:28}}>
          <button onClick={()=>setPhase("consent")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:20,fontFamily:"'Noto Sans JP',sans-serif"}}>← 同意画面に戻る</button>
          <h2 style={{fontSize:22,fontWeight:900,margin:0,color:C.text}}>利用者を選択</h2>
          <p style={{color:C.muted,fontSize:13,marginTop:8}}>初回の方は新規登録、2回目以降の方は名前を選んでください</p>
        </div>
        {userList.length>0&&(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>登録済み利用者</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {userList.map(([uid,u])=>{
                const hist=u.history||[],last=hist[0];
                return (
                  <div key={uid} onClick={()=>selectExisting(uid)} style={{display:"flex",alignItems:"center",gap:12,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s"}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:C.panel,border:`2px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>👤</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,color:C.text}}>{u.name}</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{hist.length>0?`${hist.length}回測定済み ／ 最終: ${formatDate(last.date)} ／ スコア: ${last.score}`:"測定歴なし"}</div>
                    </div>
                    <div style={{color:C.muted,fontSize:16}}>›</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={()=>{ if(window.confirm("測定履歴をすべて削除しますか？")){localStorage.clear();window.location.reload();}}} style={{width:"100%",marginBottom:12,padding:"12px",background:"transparent",border:`1.5px solid ${C.red}33`,borderRadius:12,color:C.red,fontSize:13,cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif"}}>🗑️ 測定履歴をリセット</button>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px"}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>新規登録</div>
          <div style={{display:"flex",gap:8}}>
            <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNew()} placeholder="お名前またはID（例：田中さん）" style={{flex:1,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:"'Noto Sans JP',sans-serif",outline:"none"}}/>
            <button onClick={addNew} disabled={!nameInput.trim()} style={{padding:"10px 16px",background:nameInput.trim()?C.accent:C.border,border:"none",borderRadius:8,color:nameInput.trim()?C.bg:C.muted,fontSize:13,fontWeight:700,cursor:nameInput.trim()?"pointer":"not-allowed",fontFamily:"'Noto Sans JP',sans-serif",whiteSpace:"nowrap"}}>登録して開始</button>
          </div>
        </div>
      </div></div>
    );
  }

  // ── UPLOAD ────────────────────────────────────────────────────────────────
  if (phase==="upload") {
    const history=getUserHistory(userId);
    return (
      <div style={wrap}><div style={maxW}>
        <div style={{paddingTop:40,marginBottom:20}}>
          <button onClick={()=>setPhase("userSelect")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0,marginBottom:16,fontFamily:"'Noto Sans JP',sans-serif"}}>← 利用者選択に戻る</button>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:C.accent+"1a",border:`1px solid ${C.accent}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>👤</div>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>{userName}</div>
              <div style={{fontSize:11,color:C.muted}}>{history.length>0?`${history.length+1}回目の測定`:"初回測定"}</div>
            </div>
          </div>
        </div>
        {error&&<div style={{background:C.red+"18",border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:C.red}}>⚠️ {error}</div>}
        <input ref={fileInputRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0])handleFile(e.target.files[0]);e.target.value="";}}/>
        {!videoUrl?(
          <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()} style={{border:`2px dashed ${dragOver?C.accent:C.border}`,borderRadius:16,padding:"44px 24px",textAlign:"center",cursor:"pointer",background:dragOver?C.accent+"06":C.surface,transition:"all 0.2s"}}>
            <div style={{fontSize:48,marginBottom:12}}>🎥</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>動画をドロップ、またはタップして選択</div>
            <div style={{color:C.muted,fontSize:12}}>MP4 / MOV / WebM ／ 最大200MB</div>
          </div>
        ):(
          <div>
            <video ref={videoRef} src={videoUrl} controls playsInline style={{width:"100%",borderRadius:12,background:"#000",maxHeight:320,border:`1px solid ${C.border}`}}/>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",marginTop:12}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10,fontWeight:700}}>解析前チェック</div>
              {[["スマホを固定して撮影した（横に動かして追いかけていない）",true],["真横から全身が映っている",true],["明るさは十分で影が少ない",false]].map(([label,imp])=>(
                <div key={label} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:7}}>
                  <span style={{width:16,height:16,borderRadius:4,marginTop:1,flexShrink:0,border:`1.5px solid ${imp?C.amber:C.border}`}}/>
                  <span style={{fontSize:12,color:imp?C.text:C.mutedLight,fontWeight:imp?600:400,lineHeight:1.5}}>{imp&&<span style={{color:C.amber,marginRight:3}}>★</span>}{label}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginTop:12}}>
              <button onClick={()=>{URL.revokeObjectURL(videoUrl);setVideoUrl(null);}} style={{flex:1,padding:"11px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:10,color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif"}}>動画を変更</button>
              <button onClick={startAnalysis} style={{flex:2,padding:"11px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:10,color:C.bg,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",boxShadow:`0 4px 20px ${C.accent}33`}}>解析を開始 →</button>
            </div>
          </div>
        )}
        <div style={{marginTop:24}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,fontWeight:700,marginBottom:10}}>📋 撮影ガイド</div>
          <div style={{background:C.amber+"12",border:`1.5px solid ${C.amber}44`,borderRadius:12,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
              <div style={{fontSize:12,color:C.mutedLight,lineHeight:1.7}}>スマホを横に動かしながら撮ると解析精度が下がります。<br/><span style={{color:C.text,fontWeight:600}}>スマホを固定して、人が画面を横切るのを待つ</span>のがコツです。</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div style={{background:C.red+"0e",border:`1px solid ${C.red}33`,borderRadius:10,padding:"12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}}>✗ NG</div>
              {["スマホを横に動かして人を追う","斜め前・後ろから撮影","近すぎて全身が入らない"].map(t=><div key={t} style={{fontSize:11,color:C.mutedLight,lineHeight:1.7}}>• {t}</div>)}
            </div>
            <div style={{background:C.accent+"0e",border:`1px solid ${C.accent}33`,borderRadius:10,padding:"12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.accent,marginBottom:6}}>✓ OK</div>
              {["壁や棚にスマホを立てかける","真横から全身を収める","5〜8m離れて広めに構える"].map(t=><div key={t} style={{fontSize:11,color:C.mutedLight,lineHeight:1.7}}>• {t}</div>)}
            </div>
          </div>
        </div>
      </div></div>
    );
  }

  // ── EXTRACTING / ANALYZING ─────────────────────────────────────────────────
  if (phase==="extracting"||phase==="analyzing") return (
    <div style={{...wrap,justifyContent:"center"}}>
      <div style={{...maxW,textAlign:"center",paddingTop:60}}>
        <div style={{position:"relative",width:120,height:120,margin:"0 auto 28px"}}>
          <svg width="120" height="120" style={{transform:"rotate(-90deg)",position:"absolute"}}>
            <circle cx="60" cy="60" r="50" fill="none" stroke={C.border} strokeWidth="6"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke={C.accent} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(progress/100)*314} 314`} style={{transition:"stroke-dasharray 0.5s ease"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:"'Space Mono',monospace"}}>{progress}%</span>
          </div>
        </div>
        {frames.length>0&&(
          <div style={{marginBottom:20,display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
            {frames.map((f,i)=>(
              <div key={i} style={{border:`1px solid ${C.accent}55`,borderRadius:6,overflow:"hidden"}}>
                <img src={`data:image/jpeg;base64,${f.b64}`} alt="" style={{display:"block",width:64,height:42,objectFit:"cover"}}/>
              </div>
            ))}
          </div>
        )}
        <div style={{fontSize:17,fontWeight:700,marginBottom:8}}>{progressLabel}</div>
        <div style={{color:C.muted,fontSize:13}}>{phase==="extracting"?`${frames.length} フレーム抽出済み`:"AIが歩行パターンを評価中..."}</div>
      </div>
    </div>
  );

  // ── RESULT ────────────────────────────────────────────────────────────────
  if (phase==="result"&&result) {
    const history=getUserHistory(userId);
    const prevRecord=history.length>1?history[1]:null;
    const tabs=[
      ...(history.length>1?[{id:"compare",label:"比較",icon:"📈"}]:[]),
      {id:"gait",label:"歩行指標",icon:"📊"},
      {id:"issues",label:"課題",icon:"⚠️"},
      {id:"exercises",label:"体操",icon:"🏃"},
      {id:"lifestyle",label:"生活",icon:"💡"},
    ];
    return (
      <div style={wrap}><div style={maxW}>
        <div style={{paddingTop:32}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:C.accent+"1a",border:`1px solid ${C.accent}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>👤</div>
            <span style={{fontWeight:700,color:C.text}}>{userName}</span>
            <span style={{fontSize:11,color:C.muted}}>— {history.length}回目 / {formatDate(history[0]?.date)}</span>
          </div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:"28px 20px",marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <ScoreArc score={result.score}/>
            <div style={{fontWeight:900,fontSize:17,marginTop:4,textAlign:"center"}}>{result.summary}</div>
            {history.length>1&&<ScoreHistoryChart history={history}/>}
          </div>
          {frames.length>0&&(
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"12px",marginBottom:12}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:8,letterSpacing:1}}>解析フレーム</div>
              <FrameStrip frames={frames} current={currentFrame} onSelect={setCurrentFrame}/>
              <img src={`data:image/jpeg;base64,${frames[currentFrame]?.b64}`} alt="selected" style={{width:"100%",borderRadius:8,marginTop:4,border:`1px solid ${C.border}`}}/>
            </div>
          )}
          <div style={{display:"flex",gap:4,marginBottom:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:4}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{flex:1,padding:"8px 2px",background:activeTab===t.id?C.accent:"transparent",border:"none",borderRadius:8,color:activeTab===t.id?C.bg:C.muted,fontSize:10,fontWeight:700,cursor:"pointer",transition:"all 0.2s",fontFamily:"'Noto Sans JP',sans-serif",lineHeight:1.4}}>{t.icon}<br/>{t.label}</button>
            ))}
          </div>
          {activeTab==="compare"&&(
            <div>
              <ComparePanel current={result} prev={prevRecord}/>
              {history.length>2&&(
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px"}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>測定履歴</div>
                  {history.slice(0,5).map((h,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<Math.min(history.length,5)-1?`1px solid ${C.border}`:"none"}}>
                      <div style={{fontSize:11,color:C.muted,width:80,flexShrink:0}}>{formatDate(h.date)}</div>
                      <div style={{fontWeight:700,color:h.score>=75?C.accent:h.score>=50?C.amber:C.red,fontFamily:"'Space Mono',monospace",width:36}}>{h.score}</div>
                      <div style={{fontSize:12,color:C.mutedLight,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab==="gait"&&result.gait&&(
            <div>
              {result.aids&&(
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px",marginBottom:10}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>補助具・手すり</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:result.aids.usage||result.aids.recommendation?12:0}}>
                    {result.aids.detected&&result.aids.detected.length>0
                      ?result.aids.detected.map((a,i)=><span key={i} style={{background:C.blue+"1a",border:`1px solid ${C.blue}44`,color:C.blue,borderRadius:100,padding:"4px 12px",fontSize:12,fontWeight:700}}>🦯 {a}</span>)
                      :<span style={{background:C.accent+"1a",border:`1px solid ${C.accent}33`,color:C.accent,borderRadius:100,padding:"4px 12px",fontSize:12,fontWeight:700}}>✓ 補助具なし</span>}
                  </div>
                  {result.aids.usage&&<div style={{background:C.surface,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.text,lineHeight:1.6,marginBottom:8,borderLeft:`3px solid ${C.blue}`}}><span style={{color:C.mutedLight,fontSize:11,display:"block",marginBottom:3}}>使い方の評価</span>{result.aids.usage}</div>}
                  {result.aids.recommendation&&<div style={{background:C.amber+"0f",borderRadius:8,padding:"10px 12px",fontSize:12,color:C.text,lineHeight:1.6,borderLeft:`3px solid ${C.amber}`}}><span style={{color:C.amber,fontSize:11,display:"block",marginBottom:3}}>💡 アドバイス</span>{result.aids.recommendation}</div>}
                </div>
              )}
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px 18px"}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:16}}>GAIT METRICS</div>
                <GaitMetricBar label="歩行リズム" value={result.gait.cadence} color={C.accent}/>
                <GaitMetricBar label="歩幅" value={result.gait.stride} color={C.blue}/>
                <GaitMetricBar label="体幹・姿勢" value={result.gait.posture} color={C.amber}/>
                <GaitMetricBar label="腕振り" value={result.gait.armSwing} color="#c084fc"/>
                <GaitMetricBar label="足のクリアランス" value={result.gait.footClearance} color={C.accent}/>
              </div>
            </div>
          )}
          {activeTab==="issues"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(result.issues||[]).map((issue,i)=>(
                <div key={i} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:4,marginBottom:6}}><SeverityDot s={issue.severity}/><span style={{fontWeight:700,fontSize:14}}>{issue.title}</span></div>
                  <p style={{margin:0,fontSize:13,color:C.mutedLight,lineHeight:1.65,paddingLeft:13}}>{issue.detail}</p>
                </div>
              ))}
            </div>
          )}
          {activeTab==="exercises"&&(
            <div>
              {history.length>1&&<div style={{fontSize:11,color:C.muted,marginBottom:10,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px"}}>💬 前回の体操履歴をもとに進捗に合わせた内容を提案しています</div>}
              {(result.exercises||[]).map((ex,i)=><ExerciseCard key={i} ex={ex} idx={i}/>)}
            </div>
          )}
          {activeTab==="lifestyle"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(result.lifestyle||[]).map((tip,i)=>(
                <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px"}}>
                  <span style={{width:26,height:26,borderRadius:8,background:C.accent+"1a",color:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,flexShrink:0}}>{i+1}</span>
                  <p style={{margin:0,fontSize:13,color:C.text,lineHeight:1.7}}>{tip}</p>
                </div>
              ))}
            </div>
          )}
          <button onClick={()=>window.print()} style={{width:"100%",marginTop:20,padding:"13px",background:`linear-gradient(135deg,${C.blue},#2563eb)`,border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",boxShadow:`0 4px 20px ${C.blue}33`}}>🖨️ 印刷・PDF保存</button>
          <button onClick={restart} style={{width:"100%",marginTop:8,padding:"13px",background:"transparent",border:`1.5px solid ${C.border}`,borderRadius:12,color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif"}}>別の動画で再解析</button>
        <button onClick={()=>{ if(window.confirm("測定履歴をすべて削除しますか？")){localStorage.clear();window.location.reload();}}} style={{width:"100%",marginTop:8,padding:"13px",background:"transparent",border:`1.5px solid ${C.red}33`,borderRadius:12,color:C.red,fontSize:13,cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif"}}>🗑️ 測定履歴をリセット</button>
        </div>
      </div></div>
    );
  }
  return null;
}
