import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";



const T = {
  // Panormos Medya brand — lacivert + turuncu
  bg: "#0D1219", bgCard: "#121A25", bgCardHover: "#172030", bgSurface: "#1A2535", bgInput: "#0A1018",
  border: "#1E2E42", borderLight: "#263B55",
  // Primary brand: Lacivert #223A59
  indigo: "#223A59", indigoDim: "#1A2D47", indigoGlow: "rgba(34,58,89,0.35)", indigoText: "#7DA4C7",
  // Accent brand: Turuncu #F25124
  amber: "#F25124", amberDim: "rgba(242,81,36,0.15)", amberText: "#F8906E",
  green: "#10B981", greenDim: "rgba(16,185,129,0.15)", greenText: "#6EE7B7",
  red: "#EF4444", redDim: "rgba(239,68,68,0.12)", redText: "#FCA5A5",
  violet: "#F25124", violetDim: "rgba(242,81,36,0.12)", violetText: "#F8906E",
  textPrimary: "#EEF3F9", textSecondary: "#7A9BB8", textMuted: "#405A73", white: "#FFFFFF",
};

const platformConfig = {
  ig: { label: "Instagram", color: "#E1306C", bg: "rgba(225,48,108,0.12)", icon: "IG" },
  tk: { label: "TikTok", color: "#69C9D0", bg: "rgba(105,201,208,0.12)", icon: "TK" },
  li: { label: "LinkedIn", color: "#0A66C2", bg: "rgba(10,102,194,0.15)", icon: "LI" },
  tw: { label: "Twitter/X", color: "#8B8B8B", bg: "rgba(139,139,139,0.12)", icon: "X" },
  yt: { label: "YouTube", color: "#FF0000", bg: "rgba(255,0,0,0.12)", icon: "YT" },
  fb: { label: "Facebook", color: "#1877F2", bg: "rgba(24,119,242,0.12)", icon: "FB" },
};

const INIT_CLIENTS = [
  {
    id:1, name:"Lezzet Durağı", category:"Restoran & Cafe", initials:"LD",
    accentColor:"#F59E0B", platforms:["ig","fb"],
    publishDays:["Pazartesi","Çarşamba","Cuma"], shootDays:["Salı","Perşembe"],
    monthlyFee:8500, contractStart:"Ocak 2025",
    posts:[
      {id:1,date:"27 Haz",platform:"ig",type:"Reels",title:"Menü tanıtım videosu",status:"done"},
      {id:2,date:"25 Haz",platform:"fb",type:"Fotoğraf",title:"Hafta sonu özel menü",status:"done"},
      {id:3,date:"02 Tem",platform:"ig",type:"Reels",title:"Temmuz yeni menü tanıtımı",status:"planned"},
      {id:4,date:"04 Tem",platform:"fb",type:"Fotoğraf",title:"Kampanya görseli",status:"planned"},
    ],
    invoices:[
      {id:1,no:"F-2026-031",date:"01 May 2026",amount:8500,vat:1530,total:10030,status:"paid",desc:"Mayıs ayı sosyal medya yönetimi"},
      {id:2,no:"F-2026-032",date:"01 Haz 2026",amount:8500,vat:1530,total:10030,status:"paid",desc:"Haziran ayı sosyal medya yönetimi"},
      {id:3,no:"F-2026-033",date:"01 Tem 2026",amount:9000,vat:1620,total:10620,status:"pending",desc:"Temmuz ayı sosyal medya yönetimi"},
    ],
    media:[
      {id:1,name:"menu-reels-haziran.mp4",type:"video",size:"124 MB",date:"24 Haz"},
      {id:2,name:"urun-foto-set-01.zip",type:"image",size:"48 MB",date:"22 Haz"},
      {id:3,name:"hikaye-sablonu-v2.psd",type:"design",size:"18 MB",date:"20 Haz"},
      {id:4,name:"kapak-gorseli-tem.jpg",type:"image",size:"6 MB",date:"26 Haz"},
    ],
    calEvents:[
      {day:27,type:"post",label:"IG Reels"},{day:25,type:"post",label:"FB Fotoğraf"},
      {day:24,type:"shoot",label:"Çekim"},{day:29,type:"shoot",label:"Tem. Çekim"},
      {day:2,type:"post",label:"IG Reels"},{day:4,type:"post",label:"FB Kampanya"},
    ],
  },
  {
    id:2, name:"TechNova", category:"Teknoloji & Yazılım", initials:"TN",
    accentColor:"#6366F1", platforms:["li","tw","ig"],
    publishDays:["Salı","Perşembe"], shootDays:["Pazartesi"],
    monthlyFee:6500, contractStart:"Mart 2025",
    posts:[
      {id:1,date:"26 Haz",platform:"li",type:"Makale",title:"Yapay zeka trendleri 2026",status:"done"},
      {id:2,date:"24 Haz",platform:"tw",type:"Thread",title:"Ürün güncellemesi duyurusu",status:"done"},
      {id:3,date:"01 Tem",platform:"li",type:"Makale",title:"Temmuz blog yazısı",status:"planned"},
      {id:4,date:"03 Tem",platform:"ig",type:"Carousel",title:"Ekip tanıtım serisi",status:"in_progress"},
    ],
    invoices:[
      {id:1,no:"F-2026-028",date:"01 Haz 2026",amount:6000,vat:1080,total:7080,status:"paid",desc:"Haziran ayı içerik yönetimi"},
      {id:2,no:"F-2026-034",date:"01 Tem 2026",amount:6500,vat:1170,total:7670,status:"overdue",desc:"Temmuz ayı içerik yönetimi"},
    ],
    media:[
      {id:1,name:"blog-kapak-haziran.jpg",type:"image",size:"8 MB",date:"25 Haz"},
      {id:2,name:"infografik-yapay-zeka.ai",type:"design",size:"22 MB",date:"23 Haz"},
    ],
    calEvents:[
      {day:26,type:"post",label:"LI Makale"},{day:24,type:"post",label:"TW Thread"},
      {day:1,type:"post",label:"LI Blog"},{day:3,type:"post",label:"IG Carousel"},
    ],
  },
  {
    id:3, name:"FitLife Studio", category:"Spor & Wellness", initials:"FL",
    accentColor:"#10B981", platforms:["ig","tk","yt"],
    publishDays:["Pazartesi","Çarşamba","Cuma","Pazar"], shootDays:["Salı","Cumartesi"],
    monthlyFee:12000, contractStart:"Şubat 2025",
    posts:[
      {id:1,date:"26 Haz",platform:"tk",type:"Video",title:"Sabah egzersiz rutini",status:"done"},
      {id:2,date:"24 Haz",platform:"ig",type:"Reels",title:"5 dakika core antrenmanı",status:"done"},
      {id:3,date:"30 Haz",platform:"yt",type:"Video",title:"Temmuz fitness challenge",status:"in_progress"},
      {id:4,date:"02 Tem",platform:"ig",type:"Reels",title:"Motivasyon serisi ep.4",status:"planned"},
    ],
    invoices:[
      {id:1,no:"F-2026-025",date:"01 Haz 2026",amount:12000,vat:2160,total:14160,status:"paid",desc:"Haziran ayı video + sosyal medya"},
      {id:2,no:"F-2026-035",date:"01 Tem 2026",amount:12000,vat:2160,total:14160,status:"pending",desc:"Temmuz ayı video + sosyal medya"},
    ],
    media:[
      {id:1,name:"egzersiz-serisi-v1.mp4",type:"video",size:"280 MB",date:"25 Haz"},
      {id:2,name:"thumbnail-temmuz-set.psd",type:"design",size:"45 MB",date:"26 Haz"},
      {id:3,name:"motivasyon-hikaye.mp4",type:"video",size:"94 MB",date:"24 Haz"},
    ],
    calEvents:[
      {day:26,type:"post",label:"TK Video"},{day:25,type:"shoot",label:"Çekim"},
      {day:24,type:"post",label:"IG Reels"},{day:30,type:"post",label:"YT Video"},
      {day:2,type:"post",label:"IG Reels"},
    ],
  },
  {
    id:4, name:"Moda House", category:"Giyim & Moda", initials:"MH",
    accentColor:"#EC4899", platforms:["ig","tk","fb"],
    publishDays:["Salı","Cuma","Pazar"], shootDays:["Pazartesi","Perşembe"],
    monthlyFee:15000, contractStart:"Kasım 2024",
    posts:[
      {id:1,date:"25 Haz",platform:"ig",type:"Reels",title:"Yaz koleksiyonu tanıtımı",status:"done"},
      {id:2,date:"23 Haz",platform:"tk",type:"Video",title:"Styling önerileri serisi",status:"done"},
      {id:3,date:"29 Haz",platform:"ig",type:"Carousel",title:"Yeni gelenler lookbook",status:"planned"},
    ],
    invoices:[
      {id:1,no:"F-2026-022",date:"01 Haz 2026",amount:15000,vat:2700,total:17700,status:"paid",desc:"Haziran ayı moda içerikleri"},
      {id:2,no:"F-2026-036",date:"01 Tem 2026",amount:15000,vat:2700,total:17700,status:"paid",desc:"Temmuz ayı moda içerikleri"},
    ],
    media:[
      {id:1,name:"yaz-koleksiyon-lookbook.zip",type:"image",size:"145 MB",date:"24 Haz"},
      {id:2,name:"styling-video-ep3.mp4",type:"video",size:"190 MB",date:"22 Haz"},
    ],
    calEvents:[
      {day:25,type:"post",label:"IG Reels"},{day:24,type:"shoot",label:"Çekim"},
      {day:23,type:"post",label:"TK Video"},{day:29,type:"post",label:"IG Carousel"},
    ],
  },
  {
    id:5, name:"GreenMarket", category:"Organik Gıda", initials:"GM",
    accentColor:"#34D399", platforms:["ig","fb"],
    publishDays:["Çarşamba","Cumartesi"], shootDays:["Salı"],
    monthlyFee:4500, contractStart:"Nisan 2025",
    posts:[
      {id:1,date:"25 Haz",platform:"ig",type:"Fotoğraf",title:"Haftalık ürün sepeti",status:"done"},
      {id:2,date:"02 Tem",platform:"ig",type:"Reels",title:"Organik tarif videosu",status:"planned"},
    ],
    invoices:[
      {id:1,no:"F-2026-029",date:"01 Haz 2026",amount:4500,vat:810,total:5310,status:"overdue",desc:"Haziran ayı sosyal medya yönetimi"},
      {id:2,no:"F-2026-037",date:"01 Tem 2026",amount:4500,vat:810,total:5310,status:"pending",desc:"Temmuz ayı sosyal medya yönetimi"},
    ],
    media:[
      {id:1,name:"urun-fotograflari-haziran.zip",type:"image",size:"82 MB",date:"21 Haz"},
      {id:2,name:"tarif-reels-ham.mp4",type:"video",size:"220 MB",date:"24 Haz"},
    ],
    calEvents:[
      {day:25,type:"post",label:"IG Fotoğraf"},{day:21,type:"shoot",label:"Çekim"},
      {day:2,type:"post",label:"IG Reels"},
    ],
  },
  {
    id:6, name:"AutoPremium", category:"Otomotiv", initials:"AP",
    accentColor:"#F97316", platforms:["ig","yt","fb"],
    publishDays:["Perşembe","Pazar"], shootDays:["Çarşamba"],
    monthlyFee:10000, contractStart:"Ocak 2025",
    posts:[
      {id:1,date:"25 Haz",platform:"fb",type:"Fotoğraf",title:"Araç detay çekimi — yeni model",status:"done"},
      {id:2,date:"30 Haz",platform:"yt",type:"Video",title:"Test sürüşü — uzun format",status:"in_progress"},
      {id:3,date:"04 Tem",platform:"ig",type:"Reels",title:"Yaz kampanyası klibi",status:"planned"},
    ],
    invoices:[
      {id:1,no:"F-2026-030",date:"01 Haz 2026",amount:10000,vat:1800,total:11800,status:"paid",desc:"Haziran ayı video prodüksiyon"},
      {id:2,no:"F-2026-038",date:"01 Tem 2026",amount:10000,vat:1800,total:11800,status:"pending",desc:"Temmuz ayı video prodüksiyon"},
    ],
    media:[
      {id:1,name:"arac-dis-cekim-4k.zip",type:"video",size:"2.1 GB",date:"24 Haz"},
      {id:2,name:"ic-mekan-detay.zip",type:"image",size:"134 MB",date:"23 Haz"},
    ],
    calEvents:[
      {day:25,type:"post",label:"FB Fotoğraf"},{day:24,type:"shoot",label:"Çekim"},
      {day:30,type:"post",label:"YT Video"},{day:4,type:"post",label:"IG Reels"},
    ],
  },
];

const INIT_STAFF = [
  {id:1,name:"Ayşe Yılmaz",role:"Sosyal Medya Uzmanı",initials:"AY",color:"#6366F1",type:"Tam zamanlı",email:"ayse@ajans.com",phone:"0532 111 22 33",start:"Ocak 2023",clients:["Lezzet Durağı","TechNova"],tasks:4,notes:"Kampanya stratejisi ve içerik planlamasından sorumlu."},
  {id:2,name:"Berk Şahin",role:"Video Editör",initials:"BS",color:"#EC4899",type:"Tam zamanlı",email:"berk@ajans.com",phone:"0533 222 33 44",start:"Mart 2023",clients:["FitLife Studio","AutoPremium"],tasks:3,notes:"Final cut ve renk düzeltmesi konusunda uzman."},
  {id:3,name:"Ceren Mert",role:"Grafik Tasarımcı",initials:"CM",color:"#10B981",type:"Tam zamanlı",email:"ceren@ajans.com",phone:"0535 333 44 55",start:"Haziran 2023",clients:["Moda House","TechNova"],tasks:2,notes:"Marka kimliği ve şablon tasarımlarını yürütüyor."},
  {id:4,name:"Deniz Kaya",role:"İçerik Yazarı",initials:"DK",color:"#F59E0B",type:"Part-time",email:"deniz@ajans.com",phone:"0536 444 55 66",start:"Eylül 2023",clients:["GreenMarket","Lezzet Durağı"],tasks:3,notes:"SEO odaklı içerik ve caption yazarlığı."},
  {id:5,name:"Ece Arslan",role:"Fotoğrafçı",initials:"EA",color:"#F97316",type:"Serbest",email:"ece@ajans.com",phone:"0537 555 66 77",start:"Kasım 2023",clients:["Moda House","FitLife Studio","AutoPremium"],tasks:5,notes:"Stüdyo ve saha çekimlerini yönetiyor."},
];

const INIT_TASKS = [
  {id:1,title:"Lezzet Durağı — Temmuz menü görselleri",client:"Lezzet Durağı",assignee:"AY",type:"Tasarım",priority:"high",due:"02 Tem",col:"todo"},
  {id:2,title:"FitLife — Egzersiz serisi video çekimi",client:"FitLife Studio",assignee:"BS",type:"Video",priority:"high",due:"30 Haz",col:"inprogress"},
  {id:3,title:"TechNova — LinkedIn makale serileri",client:"TechNova",assignee:"CM",type:"Metin",priority:"mid",due:"01 Tem",col:"inprogress"},
  {id:4,title:"Moda House — Hikaye şablon seti",client:"Moda House",assignee:"AY",type:"Tasarım",priority:"mid",due:"03 Tem",col:"review"},
  {id:5,title:"AutoPremium — Tanıtım videosu kurgu",client:"AutoPremium",assignee:"BS",type:"Video",priority:"low",due:"05 Tem",col:"review"},
  {id:6,title:"GreenMarket — Ürün fotoğraf çekimi",client:"GreenMarket",assignee:"EA",type:"Fotoğraf",priority:"high",due:"28 Haz",col:"todo"},
];

const INIT_IDEAS = [
  {id:1,text:"Her Salı müşteri başarı hikayesi serisi",tag:"İçerik",platforms:["ig","fb"],client:"Genel"},
  {id:2,text:"Trending seslerle hızlı ürün tanıtım formatı",tag:"Trend",platforms:["tk","ig"],client:"Moda House"},
  {id:3,text:"Sahne arkası — production süreci paylaşımı",tag:"Format",platforms:["ig","yt"],client:"Genel"},
  {id:4,text:"Yaz kampanyası hazır şablon seti",tag:"Kampanya",platforms:["ig","fb","tw"],client:"FitLife Studio"},
];

// ─────────────────────────────────────────────
// AI ENGINE
// ─────────────────────────────────────────────
async function callAI(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "Yanıt alınamadı.";
}

// AI Panel Component
function AIPanel({ title, icon, color, systemPrompt, userPrompt, onClose, extraActions }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const run = async (prompt) => {
    setLoading(true); setDone(false); setResult("");
    try {
      const r = await callAI(systemPrompt, prompt || userPrompt);
      setResult(r);
    } catch(e) {
      setResult("Hata: API bağlantısı kurulamadı.");
    }
    setLoading(false); setDone(true);
  };

  useEffect(() => { run(); }, []);

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:2000, backdropFilter:"blur(6px)",
    }} onClick={onClose}>
      <div style={{
        background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18,
        width:580, maxHeight:"82vh", display:"flex", flexDirection:"column",
        overflow:"hidden", boxShadow:`0 0 60px ${color}22`,
      }} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding:"18px 22px", borderBottom:`1px solid ${T.border}`,
          background:`linear-gradient(135deg, ${color}12, transparent)`,
          display:"flex", alignItems:"center", gap:12,
        }}>
          <div style={{
            width:38, height:38, borderRadius:10, background:`${color}22`,
            border:`1.5px solid ${color}55`, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:18,
          }}>{icon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14, fontWeight:700, color:T.textPrimary}}>{title}</div>
            <div style={{fontSize:11, color:T.textMuted, marginTop:2}}>Claude Sonnet 4.6 ile güçlendirildi</div>
          </div>
          <div style={{
            fontSize:10, fontWeight:700, padding:"3px 9px", borderRadius:20,
            background:`${color}18`, color, border:`1px solid ${color}33`,
          }}>AI</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer",lineHeight:1,marginLeft:4}}>✕</button>
        </div>

        {/* Content */}
        <div style={{flex:1, overflowY:"auto", padding:"20px 22px"}}>
          {loading && (
            <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:16, padding:"40px 0"}}>
              <div style={{
                width:44, height:44, borderRadius:"50%",
                border:`3px solid ${T.border}`, borderTopColor:color,
                animation:"spin 0.8s linear infinite",
              }} />
              <div style={{fontSize:13, color:T.textSecondary}}>Analiz ediliyor...</div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {!loading && result && (
            <div style={{
              fontSize:13, color:T.textSecondary, lineHeight:1.75,
              whiteSpace:"pre-wrap", background:T.bgSurface,
              border:`1px solid ${T.border}`, borderRadius:12, padding:"16px 18px",
            }}>{result}</div>
          )}
        </div>

        {/* Custom prompt */}
        <div style={{padding:"16px 22px", borderTop:`1px solid ${T.border}`, background:T.bgSurface}}>
          <div style={{display:"flex", gap:8, marginBottom:done && extraActions ? 10 : 0}}>
            <input
              value={customPrompt}
              onChange={e=>setCustomPrompt(e.target.value)}
              onKeyDown={e=>e.key==="Enter" && customPrompt && run(customPrompt)}
              placeholder="Farklı bir şey sor..."
              style={{
                flex:1, background:T.bgInput, border:`1px solid ${T.border}`, borderRadius:9,
                padding:"8px 13px", fontSize:13, color:T.textPrimary, outline:"none",
              }}
            />
            <button onClick={()=>customPrompt && run(customPrompt)} style={{
              background:color, color:"#fff", border:"none", borderRadius:9,
              padding:"8px 16px", fontSize:12, fontWeight:600, cursor:"pointer",
            }}>Sor</button>
            {done && <button onClick={()=>run(userPrompt)} style={{
              background:T.bgCard, color:T.textSecondary, border:`1px solid ${T.border}`,
              borderRadius:9, padding:"8px 12px", fontSize:12, cursor:"pointer",
            }}>↻</button>}
          </div>
          {done && extraActions && (
            <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
              {extraActions.map((a,i)=>(
                <button key={i} onClick={()=>run(a.prompt)} style={{
                  fontSize:11, padding:"5px 11px", borderRadius:7,
                  background:`${color}18`, color, border:`1px solid ${color}33`, cursor:"pointer",
                }}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED UI
// ─────────────────────────────────────────────
const fmtMoney = n => n.toLocaleString("tr-TR") + " ₺";

const statusConfig = {
  done:{label:"Yayınlandı",color:T.green,bg:T.greenDim},
  planned:{label:"Planlandı",color:T.amber,bg:T.amberDim},
  in_progress:{label:"Hazırlanıyor",color:T.indigo,bg:T.indigoGlow},
  paid:{label:"Ödendi",color:T.green,bg:T.greenDim},
  pending:{label:"Bekliyor",color:T.amber,bg:T.amberDim},
  overdue:{label:"Gecikti",color:T.red,bg:T.redDim},
};

const priorityConfig = {
  high:{label:"Yüksek",color:T.red,bg:T.redDim},
  mid:{label:"Orta",color:T.amber,bg:T.amberDim},
  low:{label:"Düşük",color:T.green,bg:T.greenDim},
};

function Badge({status}) {
  const cfg = statusConfig[status] || statusConfig.planned;
  return <span style={{fontSize:11,fontWeight:500,padding:"3px 9px",borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}22`}}>{cfg.label}</span>;
}

function PlatformTag({id}) {
  const p = platformConfig[id]; if(!p) return null;
  return <span style={{fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:5,background:p.bg,color:p.color,letterSpacing:"0.04em"}}>{p.icon}</span>;
}

function Avatar({initials,color,size=36}) {
  return <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,background:`${color}22`,border:`1.5px solid ${color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:600,color,letterSpacing:"0.02em"}}>{initials}</div>;
}

function Card({children,style={},onClick,hover=false}) {
  const [hov,setHov]=useState(false);
  return <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{background:hov&&hover?T.bgCardHover:T.bgCard,border:`1px solid ${hov&&hover?T.borderLight:T.border}`,borderRadius:12,transition:"all 0.15s ease",cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}

function StatCard({label,value,color,sub}) {
  return <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px"}}>
    <div style={{fontSize:11,color:T.textMuted,marginBottom:6,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</div>
    <div style={{fontSize:22,fontWeight:700,color:color||T.textPrimary,letterSpacing:"-0.02em"}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:T.textMuted,marginTop:4}}>{sub}</div>}
  </div>;
}

function Btn({children,onClick,variant="ghost",style={}}) {
  const [hov,setHov]=useState(false);
  const styles={
    primary:{background:T.amber,color:T.white,border:"none"},
    ghost:{background:hov?T.bgSurface:"transparent",color:T.textSecondary,border:`1px solid ${T.border}`},
    ai:{background:hov?"rgba(242,81,36,0.22)":T.amberDim,color:T.amberText,border:`1px solid ${T.amber}44`},
  };
  return <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{fontSize:12,fontWeight:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.12s ease",...styles[variant],...style}}>{children}</button>;
}

function Modal({title,onClose,children}) {
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"}} onClick={onClose}>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:400,maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:15,fontWeight:600,color:T.textPrimary}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:18,cursor:"pointer",lineHeight:1}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}

function FormField({label,children}) {
  return <div style={{marginBottom:12}}>
    <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:5,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</label>
    {children}
  </div>;
}

function Input({value,onChange,placeholder,type="text"}) {
  return <input value={value} onChange={onChange} placeholder={placeholder} type={type} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.textPrimary,outline:"none",boxSizing:"border-box"}} />;
}

function Select({value,onChange,children}) {
  return <select value={value} onChange={onChange} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.textPrimary,outline:"none"}}>{children}</select>;
}

function ModalActions({onClose,onSave}) {
  return <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
    <Btn onClick={onClose}>Vazgeç</Btn>
    <Btn variant="primary" onClick={onSave}>Kaydet</Btn>
  </div>;
}

// ─────────────────────────────────────────────
// CLIENTS PAGE
// ─────────────────────────────────────────────
function ClientsPage({clients,setClients}) {
  const [open,setOpen]=useState(null);
  const [tab,setTab]=useState({});
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [ai,setAi]=useState(null);

  const totalRevenue=clients.reduce((s,c)=>s+c.invoices.reduce((ss,i)=>ss+i.total,0),0);
  const pendingRevenue=clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status!=="paid").reduce((ss,i)=>ss+i.total,0),0);
  const overdueCount=clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status==="overdue").length,0);

  const clientSummary = clients.map(c=>({
    name:c.name, category:c.category, platforms:c.platforms.map(p=>platformConfig[p]?.label).join(", "),
    monthlyFee:c.monthlyFee, publishDays:c.publishDays.join(", "),
    postCount:c.posts.length, invoiceTotal:c.invoices.reduce((s,i)=>s+i.total,0),
    overdue:c.invoices.filter(i=>i.status==="overdue").length,
  }));

  return <div>
    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
      <StatCard label="Aktif Müşteri" value={clients.length} sub="Bu ay" />
      <StatCard label="Toplam Ciro" value={fmtMoney(totalRevenue)} color={T.indigoText} sub="Tüm zamanlar" />
      <StatCard label="Tahsilat Bekleyen" value={fmtMoney(pendingRevenue)} color={T.amberText} sub="Bekleyen fatura" />
      <StatCard label="Bu Ay Paylaşım" value={clients.reduce((s,c)=>s+c.posts.filter(p=>p.status==="done").length,0)} color={T.greenText} sub="Yayınlanan" />
    </div>

    {/* AI Banner */}
    <div style={{
      display:"flex", alignItems:"center", gap:14, padding:"14px 18px",
      background:`linear-gradient(135deg, rgba(242,81,36,0.10), rgba(34,58,89,0.25))`,
      border:`1px solid ${T.amber}44`, borderRadius:12, marginBottom:20, cursor:"pointer",
    }} onClick={()=>setAi("analysis")}>
      <div style={{fontSize:22}}>🤖</div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,fontWeight:600,color:T.violetText}}>Müşteri Portföy Analizi</div>
        <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>AI ile tüm müşterilerini analiz et, büyüme fırsatları ve risk noktaları bul</div>
      </div>
      <Btn variant="ai" style={{flexShrink:0}}>✦ Analiz Et</Btn>
    </div>

    {/* List */}
    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      {clients.map(client=>{
        const isOpen=open===client.id;
        const currentTab=tab[client.id]||"overview";
        const od=client.invoices.filter(i=>i.status==="overdue").length;
        return <div key={client.id}>
          <div onClick={()=>{setOpen(open===client.id?null:client.id);if(!tab[client.id])setTab(t=>({...t,[client.id]:"overview"}));}} style={{
            display:"flex",alignItems:"center",gap:14,padding:"14px 20px",
            background:isOpen?T.bgSurface:T.bgCard,
            border:`1px solid ${isOpen?T.borderLight:T.border}`,
            borderRadius:isOpen?"12px 12px 0 0":12, cursor:"pointer",
            transition:"all 0.15s ease", borderLeft:`3px solid ${client.accentColor}`,
          }}>
            <Avatar initials={client.initials} color={client.accentColor} size={40} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{client.name}</span>
                {od>0&&<span style={{fontSize:10,fontWeight:600,background:T.redDim,color:T.redText,padding:"2px 7px",borderRadius:20,border:`1px solid ${T.red}33`}}>{od} gecikmiş fatura</span>}
              </div>
              <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{client.category}</div>
            </div>
            <div style={{display:"flex",gap:5}}>{client.platforms.map(p=><PlatformTag key={p} id={p}/>)}</div>
            <div style={{textAlign:"right",minWidth:90}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>{fmtMoney(client.monthlyFee)}</div>
              <div style={{fontSize:11,color:T.textMuted}}>aylık</div>
            </div>
            <span style={{fontSize:13,color:T.textMuted,transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"rotate(0deg)",display:"inline-block"}}>›</span>
          </div>
          {isOpen&&<ClientDetail client={client} currentTab={currentTab} setTab={t=>setTab(prev=>({...prev,[client.id]:t}))} clients={clients} setClients={setClients} setModal={setModal} setForm={setForm} />}
        </div>;
      })}
      <div onClick={()=>{setModal("addClient");setForm({name:"",category:"",monthlyFee:"",publishDays:"",shootDays:"",platforms:[]});}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"14px 20px",border:`1px dashed ${T.border}`,borderRadius:12,color:T.textMuted,fontSize:13,cursor:"pointer",transition:"all 0.15s"}}>
        <span style={{fontSize:18}}>+</span> Yeni müşteri ekle
      </div>
    </div>

    {/* AI Panel */}
    {ai==="analysis"&&<AIPanel
      title="Müşteri Portföy Analizi"
      icon="📊" color={T.violet}
      systemPrompt="Sen bir sosyal medya ajansının stratejik danışmanısın. Türkçe yanıt ver. Profesyonel, net ve aksiyon odaklı ol."
      userPrompt={`Şu müşteri portföyünü analiz et:\n${JSON.stringify(clientSummary,null,2)}\n\nŞunları değerlendir:\n1. En karlı 3 müşteri ve neden\n2. Risk oluşturan müşteriler (gecikmiş fatura, düşük içerik vs)\n3. Platform çeşitlendirme fırsatları\n4. Aylık paket fiyatlandırması uygun mu?\n5. Somut 3 büyüme önerisi`}
      extraActions={[
        {label:"Churn riski analizi",prompt:`Bu müşterilerden hangisi hizmet bırakma riski taşıyor? Neden? ${JSON.stringify(clientSummary)}`},
        {label:"Upsell fırsatları",prompt:`Bu müşterilere hangi ek hizmetler önerilebilir? ${JSON.stringify(clientSummary)}`},
        {label:"Fiyat optimizasyonu",prompt:`Bu paket fiyatları piyasa koşullarına göre uygun mu? Öneri ver: ${JSON.stringify(clientSummary)}`},
      ]}
      onClose={()=>setAi(null)}
    />}

    {/* Modals */}
    {modal==="addClient"&&<Modal title="Yeni müşteri" onClose={()=>setModal(null)}>
      <FormField label="İşletme adı"><Input placeholder="Örn: Lezzet Durağı" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Kategori"><Input placeholder="Örn: Restoran & Cafe" value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></FormField>
      <FormField label="Aylık ücret (₺)"><Input type="number" placeholder="0" value={form.monthlyFee||""} onChange={e=>setForm(f=>({...f,monthlyFee:e.target.value}))} /></FormField>
      <FormField label="Paylaşım günleri"><Input placeholder="Pazartesi, Çarşamba, Cuma" value={form.publishDays||""} onChange={e=>setForm(f=>({...f,publishDays:e.target.value}))} /></FormField>
      <FormField label="Çekim günleri"><Input placeholder="Salı, Perşembe" value={form.shootDays||""} onChange={e=>setForm(f=>({...f,shootDays:e.target.value}))} /></FormField>
      <FormField label="Platformlar">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(platformConfig).map(([id,p])=>{const sel=(form.platforms||[]).includes(id);return <span key={id} onClick={()=>setForm(f=>({...f,platforms:sel?f.platforms.filter(x=>x!==id):[...(f.platforms||[]),id]}))} style={{fontSize:11,fontWeight:700,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:sel?p.bg:T.bgInput,color:sel?p.color:T.textMuted,border:`1px solid ${sel?p.color+"44":T.border}`}}>{p.label}</span>;})}
        </div>
      </FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.name)return;
        const colors=["#6366F1","#EC4899","#10B981","#F59E0B","#F97316","#34D399"];
        const initials = form.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        const accentColor = colors[clients.length%colors.length];
        const publishDays = form.publishDays?form.publishDays.split(",").map(s=>s.trim()):[];
        const shootDays = form.shootDays?form.shootDays.split(",").map(s=>s.trim()):[];
        const { data, error } = await supabase.from('clients').insert({
          name: form.name, category: form.category||"", initials, accent_color: accentColor,
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays,
          monthly_fee: parseInt(form.monthlyFee)||0, contract_start: "Temmuz 2026",
        }).select().single();
        if(!error && data){
          setClients(prev=>[...prev,{id:data.id,name:data.name,category:data.category,initials:data.initials,accentColor:data.accent_color,platforms:data.platforms||[],publishDays:data.publish_days||[],shootDays:data.shoot_days||[],monthlyFee:data.monthly_fee,contractStart:data.contract_start,posts:[],invoices:[],media:[],calEvents:[]}]);
        }
        setModal(null);
      }} />
    </Modal>}
    {modal==="addPost"&&<Modal title="Paylaşım ekle" onClose={()=>setModal(null)}>
      <FormField label="Tarih"><Input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></FormField>
      <FormField label="Platform"><Select value={form.platform||"ig"} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>{Object.entries(platformConfig).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</Select></FormField>
      <FormField label="İçerik türü"><Select value={form.type||"Reels"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["Reels","Fotoğraf","Video","Carousel","Hikaye","Makale","Thread"].map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Başlık"><Input placeholder="İçerik başlığı" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></FormField>
      <FormField label="Durum"><Select value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Planlandı</option><option value="in_progress">Hazırlanıyor</option><option value="done">Yayınlandı</option></Select></FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.title||!form.clientId)return;
        const { data, error } = await supabase.from('posts').insert({
          client_id: form.clientId, date: form.date||"—", platform: form.platform||"ig",
          type: form.type||"Reels", title: form.title, status: form.status||"planned",
        }).select().single();
        if(!error && data){
          setClients(prev=>prev.map(c=>c.id===form.clientId?{...c,posts:[...c.posts,{id:data.id,date:data.date,platform:data.platform,type:data.type,title:data.title,status:data.status}]}:c));
        }
        setModal(null);
      }} />
    </Modal>}
    {modal==="addInvoice"&&<Modal title="Fatura ekle" onClose={()=>setModal(null)}>
      <FormField label="Fatura no"><Input placeholder="F-2026-039" value={form.no||""} onChange={e=>setForm(f=>({...f,no:e.target.value}))} /></FormField>
      <FormField label="Açıklama"><Input placeholder="Temmuz ayı sosyal medya yönetimi" value={form.desc||""} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} /></FormField>
      <FormField label="Tutar (KDV hariç ₺)"><Input type="number" placeholder="0" value={form.amount||""} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} /></FormField>
      <FormField label="Fatura tarihi"><Input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></FormField>
      <FormField label="Durum"><Select value={form.status||"pending"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="pending">Bekliyor</option><option value="paid">Ödendi</option><option value="overdue">Gecikti</option></Select></FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        const amt=parseInt(form.amount)||0;
        const vat=Math.round(amt*0.18);
        const { data, error } = await supabase.from('invoices').insert({
          client_id: form.clientId, no: form.no||`F-${Date.now()}`, date: form.date||"—",
          amount: amt, vat, total: amt+vat, status: form.status||"pending", description: form.desc||"",
        }).select().single();
        if(!error && data){
          setClients(prev=>prev.map(c=>c.id===form.clientId?{...c,invoices:[...c.invoices,{id:data.id,no:data.no,date:data.date,amount:data.amount,vat:data.vat,total:data.total,status:data.status,desc:data.description}]}:c));
        }
        setModal(null);
      }} />
    </Modal>}
  </div>;
}

function ClientDetail({client,currentTab,setTab,clients,setClients,setModal,setForm}) {
  const [ai,setAi]=useState(null);
  const tabs=[{id:"overview",lbl:"Özet"},{id:"calendar",lbl:"Takvim"},{id:"posts",lbl:"Paylaşımlar"},{id:"media",lbl:"Medya"},{id:"invoices",lbl:"Faturalar"}];

  const postSummary=client.posts.map(p=>`${p.date} ${platformConfig[p.platform]?.label} ${p.type}: ${p.title} (${p.status})`).join("\n");
  const invoiceSummary=client.invoices.map(i=>`${i.no} ${i.date} ${fmtMoney(i.total)} (${i.status}): ${i.desc}`).join("\n");

  return <div style={{background:T.bgSurface,border:`1px solid ${T.borderLight}`,borderTop:"none",borderRadius:"0 0 12px 12px",marginBottom:2}}>
    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 20px",gap:2,alignItems:"center"}}>
      {tabs.map(t=>{const active=currentTab===t.id;return <button key={t.id} onClick={()=>setTab(t.id)} style={{fontSize:12,fontWeight:active?600:400,padding:"11px 16px",color:active?T.indigo:T.textMuted,background:"none",border:"none",borderBottom:`2px solid ${active?T.indigo:"transparent"}`,cursor:"pointer",transition:"all 0.12s"}}>{t.lbl}</button>;})}
      <div style={{marginLeft:"auto",display:"flex",gap:6}}>
        {currentTab==="posts"&&<Btn variant="ai" onClick={()=>setAi("caption")} style={{fontSize:11,padding:"5px 10px"}}>✦ Caption üret</Btn>}
        {currentTab==="invoices"&&<Btn variant="ai" onClick={()=>setAi("invoice")} style={{fontSize:11,padding:"5px 10px"}}>✦ Rapor oluştur</Btn>}
        {currentTab==="overview"&&<Btn variant="ai" onClick={()=>setAi("clientAnalysis")} style={{fontSize:11,padding:"5px 10px"}}>✦ Müşteri analizi</Btn>}
      </div>
    </div>
    <div style={{padding:20}}>
      {currentTab==="overview"&&<ClientOverview client={client}/>}
      {currentTab==="calendar"&&<ClientCalendar client={client}/>}
      {currentTab==="posts"&&<ClientPosts client={client} clients={clients} setClients={setClients} setModal={setModal} setForm={setForm}/>}
      {currentTab==="media"&&<ClientMedia client={client}/>}
      {currentTab==="invoices"&&<ClientInvoices client={client} clients={clients} setClients={setClients} setModal={setModal} setForm={setForm}/>}
    </div>

    {ai==="caption"&&<AIPanel
      title={`${client.name} — Caption & İçerik Fikirleri`}
      icon="✍" color="#EC4899"
      systemPrompt="Sen yaratıcı bir sosyal medya içerik yazarısın. Türkçe, enerjik ve platforma özel caption'lar yaz. Hashtag öner. Her platform için ayrı ton kullan."
      userPrompt={`${client.name} (${client.category}) için içerik caption'ları ve fikirler üret.\nPlatformlar: ${client.platforms.map(p=>platformConfig[p]?.label).join(", ")}\nSon paylaşımlar:\n${postSummary}\n\nHer aktif platform için 2 hazır caption yaz + 5 yeni içerik fikri öner. Hashtag'leri de ekle.`}
      extraActions={[
        {label:"Instagram caption",prompt:`${client.name} için Instagram Reels caption yaz. Emoji kullan, CTA ekle, 10 hashtag öner. Sektör: ${client.category}`},
        {label:"TikTok hook",prompt:`${client.name} için dikkat çekici TikTok video açılışı (hook) yaz. İlk 3 saniye kritik. 3 farklı hook ver.`},
        {label:"LinkedIn içerik",prompt:`${client.name} için profesyonel LinkedIn gönderisi yaz. Sektör: ${client.category}. Düşünce liderliği tonu.`},
        {label:"Hikaye metni",prompt:`${client.name} için Instagram hikaye serisi (5 slayt) planla ve metin yaz.`},
      ]}
      onClose={()=>setAi(null)}
    />}
    {ai==="invoice"&&<AIPanel
      title={`${client.name} — Finansal Rapor`}
      icon="📋" color={T.green}
      systemPrompt="Sen bir ajans muhasebe ve finansal raporlama asistanısın. Türkçe, net ve profesyonel raporlar hazırla."
      userPrompt={`${client.name} için finansal durum raporu hazırla:\nAylık paket: ${fmtMoney(client.monthlyFee)}\nFaturalar:\n${invoiceSummary}\n\nŞunları hazırla:\n1. Özet finansal durum\n2. Ödeme geçmişi değerlendirmesi\n3. Gecikmiş varsa aksiyon önerileri\n4. Önümüzdeki 3 ay projeksiyon\n5. E-posta ile gönderilebilecek nazik ödeme hatırlatma metni`}
      extraActions={[
        {label:"Ödeme hatırlatma e-postası",prompt:`${client.name} için nazik ama net bir ödeme hatırlatma e-postası yaz. Gecikmiş fatura var. Profesyonel ton.`},
        {label:"Sözleşme yenileme teklifi",prompt:`${client.name} için sözleşme yenileme teklif metni hazırla. Mevcut paket ${fmtMoney(client.monthlyFee)}.`},
        {label:"Performans raporu taslağı",prompt:`${client.name} için aylık sosyal medya performans raporu taslağı oluştur. Başlıklar ve bölümler belirle.`},
      ]}
      onClose={()=>setAi(null)}
    />}
    {ai==="clientAnalysis"&&<AIPanel
      title={`${client.name} — Müşteri Analizi`}
      icon="🔍" color={T.indigo}
      systemPrompt="Sen bir sosyal medya ajansı danışmanısın. Müşteri bazında stratejik analiz yaparsın. Türkçe, somut ve aksiyon odaklı ol."
      userPrompt={`${client.name} (${client.category}) müşteri analizi:\nPlatformlar: ${client.platforms.map(p=>platformConfig[p]?.label).join(", ")}\nAylık ücret: ${fmtMoney(client.monthlyFee)}\nPaylaşım günleri: ${client.publishDays.join(", ")}\nÇekim günleri: ${client.shootDays.join(", ")}\nPaylaşım sayısı: ${client.posts.length}\nMedya dosyası: ${client.media.length}\n\n1. Bu müşteri için en iyi içerik stratejisi nedir?\n2. Hangi platformda büyüme potansiyeli var?\n3. Çekim ve paylaşım günleri optimal mi?\n4. Fiyatlandırma değerlendir\n5. 3 aylık büyüme planı öner`}
      extraActions={[
        {label:"Rakip analizi",prompt:`${client.name} (${client.category}) sektöründe sosyal medyada başarılı markalar nasıl içerik üretiyor? Genel stratejiler neler?`},
        {label:"İçerik takvimi öner",prompt:`${client.name} için ${client.platforms.map(p=>platformConfig[p]?.label).join(", ")} platformlarında Temmuz ayı içerik takvimi öner. Paylaşım günleri: ${client.publishDays.join(", ")}`},
      ]}
      onClose={()=>setAi(null)}
    />}
  </div>;
}

function ClientOverview({client}) {
  const dayLabels={Pazartesi:T.indigo,Salı:"#EC4899",Çarşamba:T.green,Perşembe:"#8B5CF6",Cuma:T.amber,Cumartesi:T.red,Pazar:"#06B6D4"};
  const total=client.invoices.reduce((s,i)=>s+i.total,0);
  const paid=client.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);
  const pct=total>0?Math.round(paid/total*100):0;
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
      <StatCard label="Aylık Paket" value={fmtMoney(client.monthlyFee)} />
      <StatCard label="Paylaşım" value={client.posts.filter(p=>p.status==="done").length} sub="Bu ay yayınlanan" />
      <StatCard label="Medya Dosyası" value={client.media.length} />
      <StatCard label="Sözleşme Başlangıç" value={client.contractStart} />
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:10,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Paylaşım günleri</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{client.publishDays.map(d=><span key={d} style={{fontSize:12,fontWeight:500,padding:"5px 10px",borderRadius:6,background:`${dayLabels[d]||T.indigo}18`,color:dayLabels[d]||T.indigo,border:`1px solid ${dayLabels[d]||T.indigo}33`}}>{d}</span>)}</div>
      </div>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:10,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Çekim günleri</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{client.shootDays.map(d=><span key={d} style={{fontSize:12,fontWeight:500,padding:"5px 10px",borderRadius:6,background:"#EC489918",color:"#EC4899",border:"1px solid #EC489933"}}>{d}</span>)}</div>
      </div>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:10,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Platformlar</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{client.platforms.map(p=><PlatformTag key={p} id={p}/>)}</div>
      </div>
    </div>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
      <div style={{fontSize:11,color:T.textMuted,marginBottom:12,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>Mali özet</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:12}}>
        <div><div style={{fontSize:11,color:T.textMuted,marginBottom:3}}>Toplam</div><div style={{fontSize:18,fontWeight:700,color:T.textPrimary}}>{fmtMoney(total)}</div></div>
        <div><div style={{fontSize:11,color:T.textMuted,marginBottom:3}}>Tahsil edilen</div><div style={{fontSize:18,fontWeight:700,color:T.green}}>{fmtMoney(paid)}</div></div>
        <div><div style={{fontSize:11,color:T.textMuted,marginBottom:3}}>Bekleyen</div><div style={{fontSize:18,fontWeight:700,color:T.amber}}>{fmtMoney(total-paid)}</div></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1,height:6,background:T.bgSurface,borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg, #223A59, #F25124)`,borderRadius:3,transition:"width 0.6s ease"}} />
        </div>
        <span style={{fontSize:12,color:T.textSecondary,whiteSpace:"nowrap",fontWeight:600}}>%{pct} tahsilat</span>
      </div>
    </div>
  </div>;
}

function ClientCalendar({client}) {
  const days=["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"];
  const nums=[23,24,25,26,27,28,29,30,1,2,3,4,5,6,7,8,9,10,11,12,13];
  const typeColors={post:{bg:T.indigoGlow,color:T.indigoText},shoot:{bg:"#EC489918",color:"#F9A8D4"},design:{bg:"#8B5CF618",color:"#C4B5FD"}};
  return <div>
    <div style={{display:"flex",gap:12,marginBottom:14}}>
      {[{t:"post",l:"Paylaşım",c:T.indigoText},{t:"shoot",l:"Çekim",c:"#F9A8D4"},{t:"design",l:"Tasarım",c:"#C4B5FD"}].map(x=>(
        <div key={x.t} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textSecondary}}>
          <div style={{width:10,height:10,borderRadius:2,background:x.c}} />{x.l}
        </div>
      ))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
      {days.map(d=><div key={d} style={{fontSize:10,color:T.textMuted,textAlign:"center",padding:"3px 0",fontWeight:500}}>{d}</div>)}
      {nums.map((n,i)=>{
        const evs=client.calEvents.filter(e=>e.day===n);
        const isToday=n===29&&i<7;
        return <div key={`${n}-${i}`} style={{minHeight:64,background:isToday?T.indigoGlow:T.bgCard,border:`1px solid ${isToday?T.indigo+"55":T.border}`,borderRadius:8,padding:"5px 6px"}}>
          <div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?T.indigoText:T.textSecondary,marginBottom:4}}>{n}</div>
          {evs.map((ev,ei)=>{const ts=typeColors[ev.type]||typeColors.post;return <div key={ei} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:ts.bg,color:ts.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.label}</div>;})}
        </div>;
      })}
    </div>
  </div>;
}

function ClientPosts({client,clients,setClients,setModal,setForm}) {
  return <div>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
      <Btn variant="primary" onClick={()=>{setModal("addPost");setForm({clientId:client.id});}}>+ Paylaşım ekle</Btn>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {client.posts.map(p=>(
        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10}}>
          <PlatformTag id={p.platform}/>
          <span style={{fontSize:11,color:T.textMuted,minWidth:64}}>{p.date}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:T.bgSurface,color:T.textMuted}}>{p.type}</span>
          <span style={{fontSize:13,color:T.textPrimary,flex:1}}>{p.title}</span>
          <Badge status={p.status}/>
        </div>
      ))}
    </div>
  </div>;
}

function ClientMedia({client}) {
  const tc={video:"#EC4899",image:T.indigo,design:"#8B5CF6"};
  const ti={video:"▶",image:"▣",design:"✦"};
  return <div>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><Btn variant="primary">⬆ Dosya yükle</Btn></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
      {client.media.map(m=>(
        <div key={m.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",cursor:"pointer"}}>
          <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",background:T.bgSurface,fontSize:28,color:tc[m.type]||T.textMuted}}>{ti[m.type]||"?"}</div>
          <div style={{padding:"8px 10px"}}>
            <div style={{fontSize:11,fontWeight:500,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
            <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{m.size} · {m.date}</div>
          </div>
        </div>
      ))}
      <div style={{height:130,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,border:`1px dashed ${T.border}`,borderRadius:10,color:T.textMuted,fontSize:12,cursor:"pointer"}}>
        <span style={{fontSize:22}}>+</span>Yükle
      </div>
    </div>
  </div>;
}

function ClientInvoices({client,clients,setClients,setModal,setForm}) {
  const total=client.invoices.reduce((s,i)=>s+i.total,0);
  const paid=client.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);
  const pct=total>0?Math.round(paid/total*100):0;
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
      <StatCard label="Toplam" value={fmtMoney(total)} />
      <StatCard label="Tahsil Edilen" value={fmtMoney(paid)} color={T.greenText} />
      <StatCard label="Bekleyen" value={fmtMoney(total-paid)} color={T.amberText} />
    </div>
    <div style={{marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1,height:6,background:T.bgCard,borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg, #223A59, #F25124)`,borderRadius:3}} />
      </div>
      <span style={{fontSize:12,color:T.textSecondary,fontWeight:600}}>%{pct}</span>
    </div>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
      <Btn variant="primary" onClick={()=>{setModal("addInvoice");setForm({clientId:client.id});}}>+ Fatura ekle</Btn>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {client.invoices.map(inv=>(
        <div key={inv.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.bgCard,border:`1px solid ${inv.status==="overdue"?T.red+"44":T.border}`,borderRadius:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:500,color:T.textPrimary,marginBottom:2}}>{inv.desc}</div>
            <div style={{fontSize:11,color:T.textMuted}}>{inv.no} · {inv.date}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:14,fontWeight:700,color:T.textPrimary}}>{fmtMoney(inv.total)}</div>
            <div style={{fontSize:10,color:T.textMuted}}>KDV dahil</div>
          </div>
          <Badge status={inv.status}/>
        </div>
      ))}
    </div>
  </div>;
}

// ─────────────────────────────────────────────
// STAFF PAGE
// ─────────────────────────────────────────────
function StaffPage({staff,setStaff}) {
  const [selected,setSelected]=useState(null);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const typeColors={"Tam zamanlı":T.green,"Part-time":T.amber,"Serbest":T.indigo};

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
      <StatCard label="Toplam Çalışan" value={staff.length} />
      <StatCard label="Tam Zamanlı" value={staff.filter(s=>s.type==="Tam zamanlı").length} color={T.greenText} />
      <StatCard label="Part-time" value={staff.filter(s=>s.type==="Part-time").length} color={T.amberText} />
      <StatCard label="Serbest" value={staff.filter(s=>s.type==="Serbest").length} color={T.indigoText} />
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
      {staff.map(s=>(
        <Card key={s.id} hover onClick={()=>setSelected(selected===s.id?null:s.id)} style={{padding:20}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:14}}>
            <Avatar initials={s.initials} color={s.color} size={46}/>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{s.name}</div>
              <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{s.role}</div>
              <span style={{fontSize:10,fontWeight:600,marginTop:5,display:"inline-block",padding:"2px 8px",borderRadius:20,background:`${typeColors[s.type]||T.green}18`,color:typeColors[s.type]||T.green,border:`1px solid ${typeColors[s.type]||T.green}33`}}>{s.type}</span>
            </div>
          </div>
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:12,color:T.textSecondary,display:"flex",alignItems:"center",gap:6}}><span style={{color:T.textMuted}}>✉</span>{s.email}</div>
            <div style={{fontSize:12,color:T.textSecondary,display:"flex",alignItems:"center",gap:6}}><span style={{color:T.textMuted}}>✆</span>{s.phone}</div>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <span style={{fontSize:11,padding:"3px 9px",borderRadius:6,background:T.bgSurface,color:T.textMuted,border:`1px solid ${T.border}`}}>📋 {s.tasks} görev</span>
              <span style={{fontSize:11,padding:"3px 9px",borderRadius:6,background:T.bgSurface,color:T.textMuted,border:`1px solid ${T.border}`}}>🏢 {s.clients.length} müşteri</span>
            </div>
          </div>
          {selected===s.id&&<div style={{marginTop:14,borderTop:`1px solid ${T.border}`,paddingTop:12}}>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:6,fontWeight:500}}>ATANAN MÜŞTERİLER</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>{s.clients.map(c=><span key={c} style={{fontSize:11,padding:"3px 9px",borderRadius:6,background:`${s.color}18`,color:s.color,border:`1px solid ${s.color}33`}}>{c}</span>)}</div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:4}}>Başlangıç: {s.start}</div>
            {s.notes&&<div style={{fontSize:12,color:T.textSecondary,lineHeight:1.5,background:T.bgSurface,padding:"8px 10px",borderRadius:8}}>{s.notes}</div>}
          </div>}
        </Card>
      ))}
      <div onClick={()=>{setModal("addStaff");setForm({name:"",role:"",email:"",phone:"",type:"Tam zamanlı",start:"",notes:""});}} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,minHeight:180,border:`1px dashed ${T.border}`,borderRadius:12,color:T.textMuted,fontSize:13,cursor:"pointer"}}>
        <span style={{fontSize:24}}>+</span>Çalışan ekle
      </div>
    </div>
    {modal==="addStaff"&&<Modal title="Yeni çalışan" onClose={()=>setModal(null)}>
      <FormField label="Ad soyad"><Input placeholder="Örn: Ali Veli" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Pozisyon"><Input placeholder="Örn: Grafik Tasarımcı" value={form.role||""} onChange={e=>setForm(f=>({...f,role:e.target.value}))} /></FormField>
      <FormField label="E-posta (giriş için kullanılacak)"><Input type="email" placeholder="ali@panormosmedya.com" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></FormField>
      <FormField label="Geçici şifre (çalışana iletin)"><Input type="text" placeholder="En az 6 karakter" value={form.password||""} onChange={e=>setForm(f=>({...f,password:e.target.value}))} /></FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Çalışma tipi"><Select value={form.type||"Tam zamanlı"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option>Tam zamanlı</option><option>Part-time</option><option>Serbest</option></Select></FormField>
      <FormField label="Başlangıç tarihi"><Input type="date" value={form.start||""} onChange={e=>setForm(f=>({...f,start:e.target.value}))} /></FormField>
      <FormField label="Notlar"><Input placeholder="Uzmanlık alanı, sorumluluklar..." value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></FormField>
      {form.error && <div style={{fontSize:12,color:"#FCA5A5",marginBottom:10,background:"rgba(239,68,68,0.1)",padding:"7px 10px",borderRadius:7}}>{form.error}</div>}
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.name||!form.email||!form.password||form.password.length<6){
          setForm(f=>({...f,error:"Ad, e-posta ve en az 6 karakterli şifre zorunlu."}));
          return;
        }
        // 1) Auth kullanıcısı oluştur
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: form.email, password: form.password,
        });
        if(authError){
          setForm(f=>({...f,error:"Hesap oluşturulamadı: "+authError.message}));
          return;
        }
        // 2) staff tablosuna kaydet
        const { data, error } = await supabase.from('staff').insert({
          auth_id: authData.user ? authData.user.id : null,
          name: form.name, role: form.role||"", email: form.email, phone: form.phone||"",
          type: form.type||"Tam zamanlı", start_date: form.start||"Temmuz 2026",
          notes: form.notes||"", is_admin: false,
        }).select().single();
        if(error){
          setForm(f=>({...f,error:"Kayıt hatası: "+error.message}));
          return;
        }
        const colors=[T.indigo,"#EC4899",T.green,T.amber,T.red,"#06B6D4"];
        setStaff(prev=>[...prev,{id:data.id,name:data.name,role:data.role,initials:data.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(),color:colors[prev.length%colors.length],type:data.type,email:data.email,phone:data.phone,start:data.start_date,clients:[],tasks:0,notes:data.notes,authId:data.auth_id,isAdmin:false}]);
        setModal(null);
      }} />
    </Modal>}
  </div>;
}

// ─────────────────────────────────────────────
// TASKS PAGE
// ─────────────────────────────────────────────
function TasksPage({tasks,setTasks,clients,staff}) {
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({});
  const [ai,setAi]=useState(false);

  const cols=[
    {id:"todo",label:"Yapılacak",color:T.textMuted},
    {id:"inprogress",label:"Devam Ediyor",color:"#7DA4C7"},
    {id:"review",label:"İncelemede",color:T.amber},
    {id:"done",label:"Tamamlandı",color:T.green},
  ];

  const moveTask=async id=>{
    const order=cols.map(c=>c.id);
    const task = tasks.find(t=>t.id===id);
    const newCol = order[(order.indexOf(task.col)+1)%order.length];
    setTasks(prev=>prev.map(t=>t.id===id?{...t,col:newCol}:t));
    await supabase.from('tasks').update({ col: newCol }).eq('id', id);
  };

  const taskSummary=tasks.map(t=>`[${t.col.toUpperCase()}] ${t.title} — Atanan: ${t.assignee}, Öncelik: ${t.priority}, Son: ${t.due}`).join("\n");

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div style={{display:"flex",gap:14}}>
        {cols.map(c=>{const count=tasks.filter(t=>t.col===c.id).length;return <span key={c.id} style={{fontSize:12,color:T.textMuted}}><span style={{color:c.color,fontWeight:700}}>{count}</span> {c.label}</span>;})}
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="ai" onClick={()=>setAi(true)}>✦ Görev & Öncelik Önerisi</Btn>
        <Btn variant="primary" onClick={()=>{setModal(true);setForm({title:"",client:clients[0]?.name||"",assignee:staff[0]?.initials||"",type:"Tasarım",priority:"mid",due:""});}}>+ Görev ekle</Btn>
      </div>
    </div>

    {ai&&<AIPanel
      title="Görev & Öncelik Analizi"
      icon="📋" color={T.amber}
      systemPrompt="Sen bir ajans proje yöneticisisin. Türkçe, net ve aksiyon odaklı görev analizi yap. Deadline riski ve iş yükü dengesine dikkat et."
      userPrompt={`Mevcut görev durumu:\n${taskSummary}\n\nŞunları analiz et:\n1. Hangi görevler kritik risk taşıyor (deadline, öncelik)?\n2. İş yükü dengesi nasıl? Kim fazla yüklü?\n3. Hangi görevler önce tamamlanmalı?\n4. Takımlara özel öneriler\n5. Önümüzdeki hafta için aksiyon planı`}
      extraActions={[
        {label:"Deadline risk analizi",prompt:`Bu görevlerden hangilerinin deadline riski var?\n${taskSummary}`},
        {label:"İş yükü dengesi",prompt:`Çalışanlar arasında görev dağılımı dengeli mi?\n${taskSummary}`},
        {label:"Tamamlanma sırası öner",prompt:`Bu görevlerin ideal tamamlanma sırası ve zamanlaması nedir?\n${taskSummary}`},
      ]}
      onClose={()=>setAi(false)}
    />}

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
      {cols.map(col=>(
        <div key={col.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:12,fontWeight:600,color:col.color}}>{col.label}</span>
            <span style={{fontSize:11,background:T.bgSurface,color:T.textMuted,border:`1px solid ${T.border}`,borderRadius:20,padding:"1px 8px"}}>{tasks.filter(t=>t.col===col.id).length}</span>
          </div>
          {tasks.filter(t=>t.col===col.id).map(task=>{
            const pc=priorityConfig[task.priority];
            return <div key={task.id} onClick={()=>moveTask(task.id)} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",borderLeft:`3px solid ${pc.color}`,transition:"border-color 0.12s"}}>
              <div style={{fontSize:12,fontWeight:500,color:T.textPrimary,marginBottom:8,lineHeight:1.4}}>{task.title}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                <span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:pc.bg,color:pc.color}}>{pc.label}</span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:10,color:T.textMuted}}>{task.due}</span>
                  <div style={{width:22,height:22,borderRadius:"50%",background:T.indigoGlow,border:`1px solid ${T.indigo}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:T.indigoText}}>{task.assignee}</div>
                </div>
              </div>
              <div style={{marginTop:6,fontSize:10,color:T.textMuted}}>{task.type} · {task.client}</div>
            </div>;
          })}
          <div onClick={()=>{setModal(true);setForm({title:"",client:clients[0]?.name||"",assignee:staff[0]?.initials||"",type:"Tasarım",priority:"mid",due:"",col:col.id});}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:8,border:`1px dashed ${T.border}`,borderRadius:8,color:T.textMuted,fontSize:12,cursor:"pointer"}}>+ Ekle</div>
        </div>
      ))}
    </div>

    {modal&&<Modal title="Yeni görev" onClose={()=>setModal(false)}>
      <FormField label="Başlık"><Input placeholder="Görev açıklaması" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></FormField>
      <FormField label="Müşteri"><Select value={form.client||""} onChange={e=>setForm(f=>({...f,client:e.target.value}))}>{clients.map(c=><option key={c.id}>{c.name}</option>)}</Select></FormField>
      <FormField label="Atanan"><Select value={form.assignee||""} onChange={e=>setForm(f=>({...f,assignee:e.target.value}))}>{staff.map(s=><option key={s.id} value={s.initials}>{s.name}</option>)}</Select></FormField>
      <FormField label="Tür"><Select value={form.type||"Tasarım"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["Tasarım","Video","Metin","Fotoğraf","Onay"].map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Öncelik"><Select value={form.priority||"mid"} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}><option value="high">Yüksek</option><option value="mid">Orta</option><option value="low">Düşük</option></Select></FormField>
      <FormField label="Son tarih"><Input type="date" value={form.due||""} onChange={e=>setForm(f=>({...f,due:e.target.value}))} /></FormField>
      <ModalActions onClose={()=>setModal(false)} onSave={async()=>{
        if(!form.title)return;
        const selectedClient = clients.find(c=>c.name===form.client);
        const selectedStaff = staff.find(s=>s.initials===form.assignee);
        const { data, error } = await supabase.from('tasks').insert({
          title: form.title,
          client_id: selectedClient ? selectedClient.id : null,
          assignee_id: selectedStaff ? selectedStaff.id : null,
          type: form.type||"Tasarım", priority: form.priority||"mid",
          due_date: form.due||"—", col: form.col||"todo",
        }).select().single();
        if(!error && data){
          setTasks(prev=>[...prev,{id:data.id,title:data.title,client:form.client||"",clientId:data.client_id,assignee:form.assignee||"",assigneeId:data.assignee_id,type:data.type,priority:data.priority,due:data.due_date,col:data.col}]);
        }
        setModal(false);
      }} />
    </Modal>}
  </div>;
}

// ─────────────────────────────────────────────
// IDEAS PAGE
// ─────────────────────────────────────────────
function IdeasPage({ideas,setIdeas,clients}) {
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({});
  const [ai,setAi]=useState(false);
  const [aiClient,setAiClient]=useState(clients[0]?.name||"");

  const tagColors={İçerik:T.indigo,Trend:"#EC4899",Kampanya:T.green,Format:"#8B5CF6"};

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div style={{fontSize:13,color:T.textMuted}}>{ideas.length} fikir · Gelecek kampanyalar için fikir üretin</div>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="ai" onClick={()=>setAi(true)}>✦ AI ile fikir üret</Btn>
        <Btn variant="primary" onClick={()=>{setModal(true);setForm({text:"",tag:"İçerik",client:"Genel",platforms:[]});}}>+ Fikir ekle</Btn>
      </div>
    </div>

    {ai&&<AIPanel
      title="AI İçerik Fikir Üretici"
      icon="💡" color="#EC4899"
      systemPrompt="Sen yaratıcı bir sosyal medya stratejistisin. Viral potansiyeli yüksek, platforma özel, uygulanabilir içerik fikirleri üret. Türkçe yaz."
      userPrompt={`${aiClient} müşterisi için yaratıcı sosyal medya içerik fikirleri üret.\nMevcut fikirler:\n${ideas.filter(i=>i.client===aiClient||i.client==="Genel").map(i=>i.text).join("\n")}\n\nYENİ fikirler üret:\n1. 5 adet Reels/TikTok video fikri (hook + konsept)\n2. 3 adet kampanya fikri\n3. 2 adet viral potansiyeli yüksek trend fikri\n4. Her fikir için hangi platform ve neden?`}
      extraActions={clients.slice(0,4).map(c=>({
        label:c.name,
        prompt:`${c.name} (${c.category}) için platforma özel 10 yaratıcı içerik fikri üret. Platformlar: ${c.platforms.map(p=>platformConfig[p]?.label).join(", ")}. Her fikir için konsept, platform ve neden viral potansiyeli olduğunu açıkla.`,
      }))}
      onClose={()=>setAi(false)}
    />}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
      {ideas.map(idea=>{
        const tc=tagColors[idea.tag]||T.indigo;
        return <Card key={idea.id} hover style={{padding:16}}>
          <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:`${tc}18`,color:tc,border:`1px solid ${tc}33`,letterSpacing:"0.04em",display:"inline-block",marginBottom:10}}>{idea.tag}</span>
          <div style={{fontSize:14,fontWeight:500,color:T.textPrimary,marginBottom:8,lineHeight:1.5}}>{idea.text}</div>
          <div style={{fontSize:11,color:T.textMuted,marginBottom:10}}>{idea.client}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{idea.platforms.map(p=><PlatformTag key={p} id={p}/>)}</div>
        </Card>;
      })}
      <div onClick={()=>{setModal(true);setForm({text:"",tag:"İçerik",client:"Genel",platforms:[]});}} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,minHeight:160,border:`1px dashed ${T.border}`,borderRadius:12,color:T.textMuted,fontSize:13,cursor:"pointer"}}>
        <span style={{fontSize:24}}>+</span>Fikir ekle
      </div>
    </div>

    {modal&&<Modal title="Yeni fikir" onClose={()=>setModal(false)}>
      <FormField label="Fikir"><Input placeholder="İçerik fikrini yaz..." value={form.text||""} onChange={e=>setForm(f=>({...f,text:e.target.value}))} /></FormField>
      <FormField label="Kategori"><Select value={form.tag||"İçerik"} onChange={e=>setForm(f=>({...f,tag:e.target.value}))}>{["İçerik","Trend","Kampanya","Format"].map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Müşteri"><Select value={form.client||"Genel"} onChange={e=>setForm(f=>({...f,client:e.target.value}))}><option>Genel</option>{clients.map(c=><option key={c.id}>{c.name}</option>)}</Select></FormField>
      <FormField label="Platformlar">
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {Object.entries(platformConfig).map(([id,p])=>{const sel=(form.platforms||[]).includes(id);return <span key={id} onClick={()=>setForm(f=>({...f,platforms:sel?f.platforms.filter(x=>x!==id):[...(f.platforms||[]),id]}))} style={{fontSize:11,fontWeight:700,padding:"4px 9px",borderRadius:5,cursor:"pointer",background:sel?p.bg:T.bgInput,color:sel?p.color:T.textMuted,border:`1px solid ${sel?p.color+"44":T.border}`}}>{p.label}</span>;})}
        </div>
      </FormField>
      <ModalActions onClose={()=>setModal(false)} onSave={async()=>{
        if(!form.text)return;
        const { data, error } = await supabase.from('ideas').insert({
          text: form.text, tag: form.tag||"İçerik", client_name: form.client||"Genel",
          platforms: form.platforms||[],
        }).select().single();
        if(!error && data){
          setIdeas(prev=>[...prev,{id:data.id,text:data.text,tag:data.tag,client:data.client_name,platforms:data.platforms||[]}]);
        }
        setModal(false);
      }} />
    </Modal>}
  </div>;
}

// ─────────────────────────────────────────────
// CALENDAR PAGE
// ─────────────────────────────────────────────
function CalendarPage({clients}) {
  const days=["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"];
  const nums=[23,24,25,26,27,28,29,30,1,2,3,4,5,6,7,8,9,10,11,12,13,14];
  const allEvents=clients.flatMap(c=>c.calEvents.map(e=>({...e,clientName:c.name,accent:c.accentColor})));
  return <div>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
      <button style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>‹</button>
      <span style={{fontSize:15,fontWeight:600,color:T.textPrimary,flex:1}}>Haziran – Temmuz 2026</span>
      <div style={{display:"flex",gap:12}}>
        {[{t:"post",l:"Paylaşım",c:T.indigoText},{t:"shoot",l:"Çekim",c:"#F9A8D4"},{t:"design",l:"Tasarım",c:"#C4B5FD"}].map(l=>(
          <div key={l.t} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textSecondary}}><div style={{width:8,height:8,borderRadius:2,background:l.c}}/>{l.l}</div>
        ))}
      </div>
      <button style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
      {days.map(d=><div key={d} style={{fontSize:11,color:T.textMuted,textAlign:"center",padding:"4px 0",fontWeight:600,letterSpacing:"0.04em"}}>{d}</div>)}
      {nums.map((n,i)=>{
        const evs=allEvents.filter(e=>e.day===n);
        const isToday=n===29&&i<7;
        const bgs={post:T.indigoGlow,shoot:"#EC489918",design:"#8B5CF618"};
        const fgs={post:T.indigoText,shoot:"#F9A8D4",design:"#C4B5FD"};
        return <div key={`${n}-${i}`} style={{minHeight:90,background:isToday?"rgba(34,58,89,0.4)":T.bgCard,border:`1px solid ${isToday?"#223A5988":T.border}`,borderRadius:10,padding:"6px 7px"}}>
          <div style={{fontSize:12,fontWeight:isToday?700:400,color:isToday?T.indigoText:T.textSecondary,marginBottom:5}}>{n}</div>
          {evs.slice(0,3).map((ev,ei)=>(
            <div key={ei} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:bgs[ev.type]||T.indigoGlow,color:fgs[ev.type]||T.indigoText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid ${ev.accent}`}}>{ev.label}</div>
          ))}
          {evs.length>3&&<div style={{fontSize:9,color:T.textMuted}}>+{evs.length-3}</div>}
        </div>;
      })}
    </div>
  </div>;
}

// ─────────────────────────────────────────────
// APP SHELL
// ─────────────────────────────────────────────
const NAV=[
  {id:"clients",label:"Müşteriler",icon:"🏢"},
  {id:"calendar",label:"Takvim",icon:"📅"},
  {id:"tasks",label:"Görevler",icon:"📋"},
  {id:"ideas",label:"Fikir Havuzu",icon:"💡"},
  {id:"staff",label:"Çalışanlar",icon:"👥"},
];

// ─────────────────────────────────────────────
// VERİTABANI YÜKLEME VE DÖNÜŞTÜRME YARDIMCILARI
// ─────────────────────────────────────────────
async function loadAllData() {
  const [
    { data: clientsRaw },
    { data: staffRaw },
    { data: tasksRaw },
    { data: ideasRaw },
    { data: postsRaw },
    { data: invoicesRaw },
    { data: mediaRaw },
  ] = await Promise.all([
    supabase.from('clients').select('*').order('created_at'),
    supabase.from('staff').select('*').order('created_at'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('ideas').select('*').order('created_at'),
    supabase.from('posts').select('*').order('created_at'),
    supabase.from('invoices').select('*').order('created_at'),
    supabase.from('media').select('*').order('created_at'),
  ]);

  const clients = (clientsRaw || []).map(c => ({
    id: c.id, name: c.name, category: c.category || "", initials: c.initials || "",
    accentColor: c.accent_color || "#6366F1", platforms: c.platforms || [],
    publishDays: c.publish_days || [], shootDays: c.shoot_days || [],
    monthlyFee: c.monthly_fee || 0, contractStart: c.contract_start || "",
    posts: (postsRaw || []).filter(p => p.client_id === c.id).map(p => ({
      id: p.id, date: p.date, platform: p.platform, type: p.type, title: p.title, status: p.status,
    })),
    invoices: (invoicesRaw || []).filter(i => i.client_id === c.id).map(i => ({
      id: i.id, no: i.no, date: i.date, amount: i.amount, vat: i.vat, total: i.total,
      status: i.status, desc: i.description,
    })),
    media: (mediaRaw || []).filter(m => m.client_id === c.id).map(m => ({
      id: m.id, name: m.name, type: m.type, size: m.size, date: m.date,
    })),
    calEvents: [],
  }));

  const staff = (staffRaw || []).map(s => ({
    id: s.id, name: s.name, role: s.role || "", initials: s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    color: ["#6366F1", "#EC4899", "#10B981", "#F59E0B", "#F97316", "#06B6D4"][Math.abs(s.name.charCodeAt(0)) % 6],
    type: s.type || "Tam zamanlı", email: s.email, phone: s.phone || "",
    start: s.start_date || "", clients: [], tasks: 0, notes: s.notes || "",
    authId: s.auth_id, isAdmin: s.is_admin,
  }));

  const tasks = (tasksRaw || []).map(t => {
    const assignedStaff = staff.find(s => s.id === t.assignee_id);
    const clientObj = clients.find(c => c.id === t.client_id);
    return {
      id: t.id, title: t.title, client: clientObj ? clientObj.name : "",
      clientId: t.client_id, assignee: assignedStaff ? assignedStaff.initials : "",
      assigneeId: t.assignee_id, type: t.type || "", priority: t.priority || "mid",
      due: t.due_date || "", col: t.col || "todo",
    };
  });

  const ideas = (ideasRaw || []).map(i => ({
    id: i.id, text: i.text, tag: i.tag || "İçerik", client: i.client_name || "Genel",
    platforms: i.platforms || [],
  }));

  return { clients, staff, tasks, ideas };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const [page,setPage]=useState("clients");
  const [clients,setClients]=useState([]);
  const [staff,setStaff]=useState([]);
  const [tasks,setTasks]=useState([]);
  const [ideas,setIdeas]=useState([]);

  // Oturum kontrolü
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Giriş yapan kullanıcının staff profilini çek
  useEffect(() => {
    if (!session) { setCurrentStaff(null); return; }
    supabase.from('staff').select('*').eq('auth_id', session.user.id).single()
      .then(({ data }) => setCurrentStaff(data));
  }, [session]);

  // Tüm verileri yükle
  const refreshData = async () => {
    setDataLoading(true);
    const { clients, staff, tasks, ideas } = await loadAllData();
    setClients(clients); setStaff(staff); setTasks(tasks); setIdeas(ideas);
    setDataLoading(false);
  };

  useEffect(() => {
    if (session && currentStaff) refreshData();
  }, [session, currentStaff]);

  if (authLoading) {
    return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted,fontFamily:"'Inter',sans-serif"}}>Yükleniyor...</div>;
  }

  if (!session || !currentStaff) {
    return <Login onLogin={() => {}} />;
  }

  const isAdmin = currentStaff.is_admin;
  const myStaffId = currentStaff.id;

  // Çalışan ise sadece kendi görevlerini görsün
  const visibleTasks = isAdmin ? tasks : tasks.filter(t => t.assigneeId === myStaffId);

  const overdueInvoices=clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status==="overdue").length,0);
  const pendingTasks=visibleTasks.filter(t=>t.col!=="done").length;
  const pageTitle={clients:"Müşteriler",calendar:"İçerik Takvimi",tasks:"Görev Takibi",ideas:"Fikir Havuzu",staff:"Çalışanlar"};

  const navItems = isAdmin ? NAV : NAV.filter(n => n.id === "tasks" || n.id === "calendar");

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (dataLoading) {
    return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted,fontFamily:"'Inter',sans-serif"}}>Veriler yükleniyor...</div>;
  }

  return <div style={{display:"flex",height:"100vh",background:T.bg,color:T.textPrimary,fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",minHeight:700}}>
    {/* Sidebar */}
    <div style={{width:220,background:T.bgCard,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"16px 16px 14px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{marginBottom:6}}>
          <svg viewBox="0 0 190 56" width="168" height="50" xmlns="http://www.w3.org/2000/svg">
            <text x="2" y="22" fontFamily="'Arial Rounded MT Bold','Arial Black',Impact,sans-serif" fontWeight="900" fontSize="22" fill="#7DA4C7" letterSpacing="-0.5">panormos</text>
            <text x="2" y="50" fontFamily="'Arial Rounded MT Bold','Arial Black',Impact,sans-serif" fontWeight="900" fontSize="28" fill="#F25124" letterSpacing="-0.5">medya.</text>
          </svg>
        </div>
        <div style={{fontSize:9,color:T.textMuted,letterSpacing:"0.02em"}}>San. ve Tic. Ltd. Şti.</div>
        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:5,fontSize:10,padding:"4px 8px",borderRadius:6,background:T.amberDim,border:`1px solid ${T.amber}44`,color:T.amberText,width:"fit-content"}}>
          <span>✦</span> {isAdmin ? "Yönetici" : "Çalışan"}
        </div>
      </div>
      <div style={{padding:"12px 8px",flex:1}}>
        {navItems.map(item=>{
          const active=page===item.id;
          const badge=item.id==="tasks"?pendingTasks:item.id==="clients"?overdueInvoices:0;
          return <div key={item.id} onClick={()=>setPage(item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,marginBottom:2,background:active?"rgba(34,58,89,0.45)":"transparent",border:`1px solid ${active?T.indigo+"88":"transparent"}`,color:active?"#A8C4DC":T.textSecondary,cursor:"pointer",fontSize:13,fontWeight:active?600:400,transition:"all 0.12s"}}>
            <span style={{fontSize:15}}>{item.icon}</span>
            <span style={{flex:1}}>{item.label}</span>
            {badge>0&&<span style={{fontSize:10,fontWeight:700,background:overdueInvoices>0&&item.id==="clients"?T.redDim:"rgba(242,81,36,0.15)",color:overdueInvoices>0&&item.id==="clients"?T.redText:T.amberText,padding:"1px 7px",borderRadius:20}}>{badge}</span>}
          </div>;
        })}
      </div>
      <div style={{padding:"14px 16px",borderTop:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:`${T.amber}22`,border:`1.5px solid ${T.amber}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.amberText}}>
            {currentStaff.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentStaff.name}</div>
            <div style={{fontSize:10,color:T.textMuted}}>{currentStaff.role}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{width:"100%",fontSize:11,padding:"6px",borderRadius:7,background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,cursor:"pointer"}}>Çıkış Yap</button>
      </div>
    </div>

    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"14px 28px",borderBottom:`1px solid ${T.border}`,background:T.bgCard,display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:700,color:T.textPrimary,letterSpacing:"-0.02em"}}>{pageTitle[page]}</div>
        </div>
        {isAdmin && overdueInvoices>0&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,padding:"6px 12px",borderRadius:8,background:T.redDim,color:T.redText,border:`1px solid ${T.red}33`}}>⚠ {overdueInvoices} gecikmiş fatura</div>}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {staff.slice(0,4).map(s=><div key={s.id} title={s.name} style={{width:30,height:30,borderRadius:"50%",background:`${s.color}22`,border:`1.5px solid ${s.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:s.color}}>{s.initials}</div>)}
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:28}}>
        {page==="clients"&&isAdmin&&<ClientsPage clients={clients} setClients={setClients}/>}
        {page==="calendar"&&<CalendarPage clients={clients}/>}
        {page==="tasks"&&<TasksPage tasks={visibleTasks} setTasks={setTasks} clients={clients} staff={staff}/>}
        {page==="ideas"&&isAdmin&&<IdeasPage ideas={ideas} setIdeas={setIdeas} clients={clients}/>}
        {page==="staff"&&isAdmin&&<StaffPage staff={staff} setStaff={setStaff}/>}
      </div>
    </div>
  </div>;
}
