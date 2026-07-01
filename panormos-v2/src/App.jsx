import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";

const T = {
  bg: "#0D1219", bgCard: "#121A25", bgCardHover: "#172030", bgSurface: "#1A2535", bgInput: "#0A1018",
  border: "#1E2E42", borderLight: "#263B55",
  indigo: "#223A59", indigoDim: "#1A2D47", indigoGlow: "rgba(34,58,89,0.35)", indigoText: "#7DA4C7",
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

const CONTENT_TYPES = ["Reels", "Post", "Hikaye", "Kaydırmalı Post", "Yayına Alındı", "Yayından Kaldırıldı"];
const TR_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  let startWeekday = firstDay.getDay();
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthLastDay - i, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const nextDay = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ day: nextDay, currentMonth: false });
    if (cells.length >= 42) break;
  }
  return cells;
}

const ENC_KEY = "panormos-medya-2026-secure-key";
function encryptText(text) {
  if (!text) return "";
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ ENC_KEY.charCodeAt(i % ENC_KEY.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

function decryptText(encoded) {
  if (!encoded) return "";
  try {
    const text = decodeURIComponent(escape(atob(encoded)));
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ ENC_KEY.charCodeAt(i % ENC_KEY.length));
    }
    return result;
  } catch (e) {
    return "";
  }
}

function exportToExcelDetailed(rows, filename, title = "") {
  if (!rows || rows.length === 0) {
    alert("Dışa aktarılacak veri bulunamadı");
    return;
  }
  
  const headers = Object.keys(rows[0]);
  let csvContent = "\uFEFF";
  
  if (title) {
    csvContent += title + "\n";
    csvContent += "İndiriş Tarihi: " + new Date().toLocaleString("tr-TR") + "\n\n";
  }
  
  csvContent += headers.map(h => `"${h}"`).join(";") + "\n";
  
  csvContent += rows.map(row => {
    return headers.map(h => {
      let val = row[h] === null || row[h] === undefined ? "" : String(row[h]);
      val = val.replace(/"/g, '""');
      if (val.includes(";") || val.includes("\n") || val.includes('"')) {
        val = `"${val}"`;
      }
      return val;
    }).join(";");
  }).join("\r\n");
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function MessagingPanel({clientId, clientName, onClose}) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    
    const msg = {
      id: Date.now(),
      clientId,
      text: newMessage,
      timestamp: new Date().toLocaleString("tr-TR"),
      sender: "admin",
    };
    
    setMessages(prev => [...prev, msg]);
    
    await supabase.from('messages').insert({
      client_id: clientId,
      text: newMessage,
      sender: "admin",
      created_at: new Date().toISOString(),
    }).catch(err => console.error("Mesaj kaydedilemedi:", err));
    
    setNewMessage("");
  };
  
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2500,backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,width:420,height:500,display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{clientName}</div>
            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>💬 Mesaj Geçmişi</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        
        <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
          {messages.length === 0 && (
            <div style={{textAlign:"center",color:T.textMuted,fontSize:12,marginTop:"50px"}}>
              Henüz mesaj yok. İlk mesajı gönder!
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{
              background: msg.sender === "admin" ? T.amber : T.indigo,
              color: T.white,
              padding: "8px 12px",
              borderRadius: "10px",
              fontSize: 12,
              maxWidth: "80%",
              marginLeft: msg.sender === "admin" ? "auto" : 0,
              marginRight: msg.sender === "admin" ? 0 : "auto",
            }}>
              <div>{msg.text}</div>
              <div style={{fontSize:10,opacity:0.7,marginTop:4}}>{msg.timestamp}</div>
            </div>
          ))}
        </div>
        
        <div style={{padding:"12px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8}}>
          <input
            value={newMessage}
            onChange={e=>setNewMessage(e.target.value)}
            onKeyDown={e=>e.key==="Enter" && handleSendMessage()}
            placeholder="Mesaj yaz..."
            style={{
              flex:1,background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,
              padding:"8px 12px",fontSize:12,color:T.textPrimary,outline:"none",
            }}
          />
          <button onClick={handleSendMessage} style={{
            background:T.amber,color:T.white,border:"none",borderRadius:8,
            padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",
          }}>Gönder</button>
        </div>
      </div>
    </div>
  );
}

function FileUploadPanel({clientId, onClose, onUploadComplete}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles]);
  };
  
  const handleDragDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  };
  
  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    
    for (const file of files) {
      try {
        const fileName = `${clientId}-${Date.now()}-${file.name}`;
        const { data, error } = await supabase.storage
          .from('client-media')
          .upload(fileName, file);
        
        if (!error) {
          await supabase.from('media').insert({
            client_id: clientId,
            name: file.name,
            type: file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'file',
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            date: new Date().toLocaleDateString("tr-TR"),
            storage_path: data.path,
          });
        }
      } catch (err) {
        console.error("Yükleme hatası:", err);
      }
    }
    
    setUploading(false);
    setFiles([]);
    onUploadComplete?.();
  };
  
  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2500,backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,maxWidth:500,width:"90%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:600,color:T.textPrimary}}>📁 Dosya Yükle</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        
        <div
          onDragOver={e=>e.preventDefault()}
          onDrop={handleDragDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:`2px dashed ${T.amber}`,
            borderRadius:12,
            padding:"30px 20px",
            textAlign:"center",
            cursor:"pointer",
            background:`${T.amber}12`,
            marginBottom:16,
            transition:"all 0.2s",
          }}
        >
          <div style={{fontSize:32,marginBottom:8}}>📸</div>
          <div style={{fontSize:13,color:T.textPrimary,fontWeight:600,marginBottom:4}}>Dosya sürükle ve bırak</div>
          <div style={{fontSize:11,color:T.textMuted}}>veya tıklayarak dosya seç</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{display:"none"}}
            accept="image/*,video/*"
          />
        </div>
        
        {files.length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:8,fontWeight:500}}>Seçili Dosyalar ({files.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {files.map((file, idx) => (
                <div key={idx} style={{
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  padding:"8px 12px",
                  background:T.bgSurface,
                  borderRadius:8,
                  border:`1px solid ${T.border}`,
                }}>
                  <span style={{fontSize:16}}>
                    {file.type.startsWith('image') ? '🖼' : file.type.startsWith('video') ? '🎥' : '📄'}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {file.name}
                    </div>
                    <div style={{fontSize:10,color:T.textMuted}}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    style={{
                      background:"none",
                      border:"none",
                      color:T.textMuted,
                      fontSize:14,
                      cursor:"pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div style={{
          fontSize:11,
          color:T.textMuted,
          background:T.bgSurface,
          padding:"8px 12px",
          borderRadius:8,
          marginBottom:16,
          border:`1px solid ${T.border}`,
        }}>
          💾 Maksimum 500 MB dosya yükleyebilirsin. Video ve resim formatları destekleniyor.
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{fontSize:12,fontWeight:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.12s ease",background:"transparent",color:T.textSecondary,border:`1px solid ${T.border}`}}>Vazgeç</button>
          <button 
            onClick={handleUpload}
            style={{
              fontSize:12,fontWeight:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.12s ease",background:T.amber,color:T.white,border:"none",opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? "none" : "auto"
            }}
          >
            {uploading ? "Yükleniyor..." : `Yükle (${files.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  };
  return <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{fontSize:12,fontWeight:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.12s ease",...styles[variant],...style}}>{children}</button>;
}

function Modal({title,onClose,children}) {
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"}} onClick={onClose}>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,maxWidth:500,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
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

function Textarea({value,onChange,placeholder}) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.textPrimary,outline:"none",boxSizing:"border-box",minHeight:80,fontFamily:"inherit",resize:"vertical"}} />;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("Tümü");
  const [filterPlatform, setFilterPlatform] = useState("Tümü");
  const [messagingClient, setMessagingClient] = useState(null);

  const totalRevenue=clients.reduce((s,c)=>s+c.invoices.reduce((ss,i)=>ss+i.total,0),0);
  const pendingRevenue=clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status!=="paid").reduce((ss,i)=>ss+i.total,0),0);
  const overdueCount=clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status==="overdue").length,0);

  const categories = [...new Set(clients.map(c => c.category).filter(Boolean))];
  const filteredClients = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = filterCategory === "Tümü" || c.category === filterCategory;
    const matchPlatform = filterPlatform === "Tümü" || c.platforms.includes(filterPlatform);
    return matchSearch && matchCategory && matchPlatform;
  });

  const handleExportClients = () => {
    const rows = filteredClients.map(c => ({
      "İşletme Adı": c.name,
      "Kategori": c.category,
      "Telefon": c.phone || "—",
      "Adres": c.address || "—",
      "İl": c.city || "—",
      "İlçe": c.district || "—",
      "Vergi Numarası": c.taxNumber || "—",
      "Vergi Dairesi": c.taxOffice || "—",
      "Platformlar": c.platforms.map(p=>platformConfig[p]?.label).join(", "),
      "Aylık Ücret": c.monthlyFee,
      "Toplam Fatura": c.invoices.reduce((s,i)=>s+i.total,0),
    }));
    exportToExcelDetailed(rows, `panormos-musteriler-${new Date().toISOString().slice(0,10)}.csv`, "PANORMOs MEDYA - MÜŞTERİ LİSTESİ");
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
      <StatCard label="Aktif Müşteri" value={filteredClients.length} sub={`Toplam: ${clients.length}`} />
      <StatCard label="Toplam Ciro" value={fmtMoney(totalRevenue)} color={T.indigoText} sub="Tüm zamanlar" />
      <StatCard label="Tahsilat Bekleyen" value={fmtMoney(pendingRevenue)} color={T.amberText} sub={`${overdueCount} gecikmiş`} />
      <StatCard label="Bu Ay Paylaşım" value={filteredClients.reduce((s,c)=>s+c.posts.filter(p=>p.status==="done").length,0)} color={T.greenText} sub="Yayınlanan" />
    </div>

    <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:200}}>
        <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:6,fontWeight:500,textTransform:"uppercase"}}>🔍 Ara</label>
        <Input placeholder="Müşteri adı ara..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
      </div>
      <div style={{minWidth:150}}>
        <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:6,fontWeight:500,textTransform:"uppercase"}}>Kategori</label>
        <Select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}>
          <option>Tümü</option>
          {categories.map(cat => <option key={cat}>{cat}</option>)}
        </Select>
      </div>
      <div style={{minWidth:150}}>
        <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:6,fontWeight:500,textTransform:"uppercase"}}>Platform</label>
        <Select value={filterPlatform} onChange={e=>setFilterPlatform(e.target.value)}>
          <option>Tümü</option>
          {Object.entries(platformConfig).map(([id,p]) => <option key={id} value={id}>{p.label}</option>)}
        </Select>
      </div>
    </div>

    <div style={{display:"flex",gap:10,marginBottom:20}}>
      <div onClick={handleExportClients} style={{
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
        padding:"14px 24px", background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:12,
        cursor:"pointer", minWidth:120,
      }}>
        <span style={{fontSize:20}}>📊</span>
        <span style={{fontSize:11,fontWeight:600,color:T.textSecondary}}>Excel'e Aktar</span>
      </div>
      <Btn variant="primary" onClick={()=>{setModal("addClient");setForm({name:"",category:"",phone:"",address:"",city:"",district:"",taxNumber:"",taxOffice:"",monthlyFee:"",publishDays:"",shootDays:"",platforms:[]});}} style={{flex:1}}>+ Yeni müşteri ekle</Btn>
    </div>

    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      {filteredClients.map(client=>{
        const isOpen=open===client.id;
        const currentTab=tab[client.id]||"overview";
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
              <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{client.name}</div>
              <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{client.category} • {client.phone}</div>
            </div>
            <div style={{display:"flex",gap:5}}>{client.platforms.map(p=><PlatformTag key={p} id={p}/>)}</div>
            <div style={{textAlign:"right",minWidth:90}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>{fmtMoney(client.monthlyFee)}</div>
              <div style={{fontSize:11,color:T.textMuted}}>aylık</div>
            </div>
            <span style={{fontSize:13,color:T.textMuted,transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
          </div>
          {isOpen&&<ClientDetail client={client} currentTab={currentTab} setTab={t=>setTab(prev=>({...prev,[client.id]:t}))} clients={clients} setClients={setClients} setModal={setModal} setForm={setForm} setMessagingClient={setMessagingClient} />}
        </div>;
      })}
    </div>

    {modal==="addClient"&&<Modal title="Yeni müşteri ekle" onClose={()=>setModal(null)}>
      <FormField label="İşletme adı"><Input placeholder="Örn: Lezzet Durağı" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Kategori"><Input placeholder="Örn: Restoran & Cafe" value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Adres"><Textarea placeholder="Açık adres" value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FormField label="İl"><Input placeholder="Istanbul" value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></FormField>
        <FormField label="İlçe"><Input placeholder="Besiktas" value={form.district||""} onChange={e=>setForm(f=>({...f,district:e.target.value}))} /></FormField>
      </div>
      <FormField label="Vergi Numarası"><Input placeholder="12345678901" value={form.taxNumber||""} onChange={e=>setForm(f=>({...f,taxNumber:e.target.value}))} /></FormField>
      <FormField label="Vergi Dairesi"><Input placeholder="Istanbul Vergi Dairesi" value={form.taxOffice||""} onChange={e=>setForm(f=>({...f,taxOffice:e.target.value}))} /></FormField>
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
        const colors=["#6366F1","#EC4899","#10B981","#F59E0B","#F97316"];
        const initials = form.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        const accentColor = colors[clients.length%colors.length];
        const publishDays = form.publishDays?form.publishDays.split(",").map(s=>s.trim()):[];
        const shootDays = form.shootDays?form.shootDays.split(",").map(s=>s.trim()):[];
        const { data, error } = await supabase.from('clients').insert({
          name: form.name, category: form.category||"", initials, accent_color: accentColor,
          phone: form.phone||"", address: form.address||"", city: form.city||"", district: form.district||"",
          tax_number: form.taxNumber||"", tax_office: form.taxOffice||"",
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays,
          monthly_fee: parseInt(form.monthlyFee)||0, contract_start: "Temmuz 2026",
        }).select().single();
        if(!error && data){
          setClients(prev=>[...prev,{id:data.id,name:data.name,category:data.category,initials:data.initials,accentColor:data.accent_color,phone:data.phone,address:data.address,city:data.city,district:data.district,taxNumber:data.tax_number,taxOffice:data.tax_office,platforms:data.platforms||[],publishDays:data.publish_days||[],shootDays:data.shoot_days||[],monthlyFee:data.monthly_fee,contractStart:data.contract_start,posts:[],invoices:[],media:[],socialAccounts:[],calEvents:[]}]);
        }
        setModal(null);
      }} />
    </Modal>}

    {modal==="addPost"&&<Modal title="Yeni paylaşım ekle" onClose={()=>setModal(null)}>
      <FormField label="Tarih"><Input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></FormField>
      <FormField label="Platform"><Select value={form.platform||"ig"} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>{Object.entries(platformConfig).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</Select></FormField>
      <FormField label="İçerik türü"><Select value={form.type||"Reels"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{CONTENT_TYPES.map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Başlık"><Input placeholder="İçerik başlığı" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></FormField>
      <FormField label="Açıklama"><Textarea placeholder="İçerik açıklaması" value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></FormField>
      <FormField label="Durum"><Select value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Planlandı</option><option value="in_progress">Hazırlanıyor</option><option value="done">Yayınlandı</option></Select></FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.title||!form.clientId)return;
        const { data, error } = await supabase.from('posts').insert({
          client_id: form.clientId, date: form.date||"—", platform: form.platform||"ig",
          type: form.type||"Reels", title: form.title, status: form.status||"planned", description: form.description||"",
        }).select().single();
        if(!error && data){
          setClients(prev=>prev.map(c=>c.id===form.clientId?{...c,posts:[...c.posts,{id:data.id,date:data.date,platform:data.platform,type:data.type,title:data.title,status:data.status,description:data.description}]}:c));
        }
        setModal(null);
      }} />
    </Modal>}

    {messagingClient && <MessagingPanel clientId={messagingClient.id} clientName={messagingClient.name} onClose={()=>setMessagingClient(null)} />}
  </div>;
}

function ClientDetail({client,currentTab,setTab,clients,setClients,setModal,setForm,setMessagingClient}) {
  const [uploadPanel, setUploadPanel] = useState(false);
  
  const tabs=[{id:"overview",lbl:"Özet"},{id:"posts",lbl:"Paylaşımlar"},{id:"media",lbl:"Medya"},{id:"invoices",lbl:"Faturalar"}];

  return <div style={{background:T.bgSurface,border:`1px solid ${T.borderLight}`,borderTop:"none",borderRadius:"0 0 12px 12px",marginBottom:2}}>
    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 20px",gap:2,alignItems:"center",flexWrap:"wrap"}}>
      {tabs.map(t=>{const active=currentTab===t.id;return <button key={t.id} onClick={()=>setTab(t.id)} style={{fontSize:12,fontWeight:active?600:400,padding:"11px 16px",color:active?T.amberText:T.textMuted,background:"none",border:"none",borderBottom:`2px solid ${active?T.amber:"transparent"}`,cursor:"pointer",transition:"all 0.12s",whiteSpace:"nowrap"}}>{t.lbl}</button>;})}
      <div style={{marginLeft:"auto",display:"flex",gap:6}}>
        {currentTab==="posts"&&<Btn variant="primary" onClick={()=>{setModal("addPost");setForm({clientId:client.id});}} style={{fontSize:11,padding:"5px 10px"}}>+ Paylaşım</Btn>}
        {currentTab==="media"&&<Btn variant="primary" onClick={()=>setUploadPanel(true)} style={{fontSize:11,padding:"5px 10px"}}>⬆ Dosya Yükle</Btn>}
        <Btn onClick={()=>setMessagingClient(client)} style={{fontSize:11,padding:"5px 10px"}}>💬 Mesaj</Btn>
      </div>
    </div>
    <div style={{padding:20}}>
      {currentTab==="overview"&&<ClientOverview client={client}/>}
      {currentTab==="posts"&&<ClientPosts client={client}/>}
      {currentTab==="media"&&<ClientMedia client={client}/>}
      {currentTab==="invoices"&&<ClientInvoices client={client}/>}
    </div>
    
    {uploadPanel && <FileUploadPanel clientId={client.id} onClose={()=>setUploadPanel(false)} onUploadComplete={()=>{setUploadPanel(false);}} />}
  </div>;
}

function ClientOverview({client}) {
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
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:8,fontWeight:500,textTransform:"uppercase"}}>İşletme Bilgileri</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12}}>
          <div><span style={{color:T.textMuted}}>Telefon:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.phone||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Şehir:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.city||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Vergi No:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.taxNumber||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Vergi Dairesi:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.taxOffice||"—"}</span></div>
        </div>
      </div>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:8,fontWeight:500,textTransform:"uppercase"}}>Mali Özet</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.textMuted}}>Toplam</div><div style={{fontSize:18,fontWeight:700,color:T.textPrimary}}>{fmtMoney(total)}</div></div>
          <div><div style={{fontSize:11,color:T.textMuted}}>Tahsil Edilen</div><div style={{fontSize:14,fontWeight:700,color:T.green}}>{fmtMoney(paid)}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:6,background:T.bgSurface,borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:T.amber,borderRadius:3}} />
            </div>
            <span style={{fontSize:11,color:T.textMuted}}>%{pct}</span>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function ClientPosts({client}) {
  return <div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {client.posts.length === 0 && (
        <div style={{textAlign:"center",padding:"30px 0",color:T.textMuted,fontSize:13}}>Henüz paylaşım eklenmemiş</div>
      )}
      {client.posts.map(p=>(
        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10}}>
          <PlatformTag id={p.platform}/>
          <span style={{fontSize:11,color:T.textMuted,minWidth:80}}>{p.date}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:T.bgSurface,color:T.textMuted}}>{p.type}</span>
          <span style={{fontSize:13,color:T.textPrimary,flex:1}}>{p.title}</span>
          <Badge status={p.status}/>
        </div>
      ))}
    </div>
  </div>;
}

function ClientMedia({client}) {
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
      {client.media.map(m=>(
        <div key={m.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",background:T.bgSurface,fontSize:28}}>
            {m.type === "video" ? "🎥" : m.type === "image" ? "🖼" : "📄"}
          </div>
          <div style={{padding:"8px 10px"}}>
            <div style={{fontSize:11,fontWeight:500,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
            <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{m.size}</div>
          </div>
        </div>
      ))}
    </div>
  </div>;
}

function ClientInvoices({client}) {
  const total=client.invoices.reduce((s,i)=>s+i.total,0);
  const paid=client.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
      <StatCard label="Toplam" value={fmtMoney(total)} />
      <StatCard label="Tahsil Edilen" value={fmtMoney(paid)} color={T.greenText} />
      <StatCard label="Bekleyen" value={fmtMoney(total-paid)} color={T.amberText} />
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {client.invoices.length === 0 && (
        <div style={{textAlign:"center",padding:"30px 0",color:T.textMuted,fontSize:13}}>Henüz fatura eklenmemiş</div>
      )}
      {client.invoices.map(inv=>(
        <div key={inv.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500,color:T.textPrimary}}>{inv.desc}</div>
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
// TASKS PAGE
// ─────────────────────────────────────────────
function TasksPage({tasks,setTasks,clients,staff}) {
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({});
  const [selectedTask,setSelectedTask]=useState(null);

  const cols=[
    {id:"todo",label:"Yapılacak",color:T.textMuted},
    {id:"inprogress",label:"Devam Ediyor",color:"#7DA4C7"},
    {id:"review",label:"İncelemede",color:T.amber},
    {id:"done",label:"Tamamlandı",color:T.green},
  ];

  const moveTask=async (id, newCol)=>{
    setTasks(prev=>prev.map(t=>t.id===id?{...t,col:newCol}:t));
    if(selectedTask && selectedTask.id===id){
      setSelectedTask({...selectedTask,col:newCol});
    }
    await supabase.from('tasks').update({ col: newCol }).eq('id', id);
  };

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.col === "done").length;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return <div>
    <div style={{marginBottom:20,padding:"16px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>Toplam Tamamlanma Oranı</span>
        <span style={{fontSize:14,fontWeight:700,color:T.amber}}>{progressPercent}%</span>
      </div>
      <div style={{height:12,background:T.bgSurface,borderRadius:6,overflow:"hidden",border:`1px solid ${T.border}`}}>
        <div style={{height:"100%",width:`${progressPercent}%`,background:`linear-gradient(90deg, ${T.indigo}, ${T.amber}, ${T.green})`,borderRadius:6,transition:"width 0.6s ease",boxShadow:`0 0 20px ${T.amber}66`}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,color:T.textMuted}}>
        <span>✓ {doneTasks}</span>
        <span>→ {tasks.filter(t => t.col === "inprogress").length}</span>
        <span>◐ {tasks.filter(t => t.col === "review").length}</span>
        <span>○ {tasks.filter(t => t.col === "todo").length}</span>
      </div>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <Btn variant="primary" onClick={()=>{setModal(true);setForm({title:"",client:clients[0]?.name||"",assignee:staff[0]?.initials||"",type:"Tasarım",priority:"mid",due:""});}}>+ Görev ekle</Btn>
    </div>

    {selectedTask && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setSelectedTask(null)}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:400}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:16,fontWeight:600,color:T.textPrimary}}>{selectedTask.title}</div>
            <button onClick={()=>setSelectedTask(null)} style={{background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
            <div><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Müşteri</div><div style={{fontSize:13,color:T.textPrimary}}>{selectedTask.client}</div></div>
            <div><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Durum</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                {cols.map(c=>(
                  <button key={c.id} onClick={()=>moveTask(selectedTask.id, c.id)} style={{padding:"6px",fontSize:10,fontWeight:600,borderRadius:6,background:selectedTask.col===c.id?T.amber:T.bgSurface,color:selectedTask.col===c.id?T.white:T.textMuted,border:`1px solid ${T.border}`,cursor:"pointer"}}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={()=>setSelectedTask(null)} style={{width:"100%",padding:"8px",fontSize:13,fontWeight:600,borderRadius:8,background:T.amber,color:T.white,border:"none",cursor:"pointer"}}>Kapat</button>
        </div>
      </div>
    )}

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
      {cols.map(col=>(
        <div key={col.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:12,fontWeight:600,color:col.color}}>{col.label}</span>
            <span style={{fontSize:10,background:T.bgSurface,color:T.textMuted,borderRadius:20,padding:"1px 8px"}}>{tasks.filter(t=>t.col===col.id).length}</span>
          </div>
          {tasks.filter(t=>t.col===col.id).map(task=>(
            <div key={task.id} onClick={()=>setSelectedTask(task)} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",borderLeft:`3px solid ${priorityConfig[task.priority]?.color}`,transition:"all 0.12s"}}>
              <div style={{fontSize:12,fontWeight:500,color:T.textPrimary,marginBottom:6}}>{task.title}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:priorityConfig[task.priority]?.bg,color:priorityConfig[task.priority]?.color}}>{priorityConfig[task.priority]?.label}</span>
                <span style={{fontSize:10,color:T.textMuted}}>{task.due}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>

    {modal&&<Modal title="Yeni görev" onClose={()=>setModal(false)}>
      <FormField label="Başlık"><Input placeholder="Görev" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></FormField>
      <FormField label="Müşteri"><Select value={form.client||""} onChange={e=>setForm(f=>({...f,client:e.target.value}))}>{clients.map(c=><option key={c.id}>{c.name}</option>)}</Select></FormField>
      <FormField label="Tür"><Select value={form.type||"Tasarım"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["Tasarım","Video","Metin","Fotoğraf"].map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Öncelik"><Select value={form.priority||"mid"} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}><option value="high">Yüksek</option><option value="mid">Orta</option><option value="low">Düşük</option></Select></FormField>
      <FormField label="Son tarih"><Input type="date" value={form.due||""} onChange={e=>setForm(f=>({...f,due:e.target.value}))} /></FormField>
      <ModalActions onClose={()=>setModal(false)} onSave={async()=>{
        if(!form.title)return;
        const { data, error } = await supabase.from('tasks').insert({
          title: form.title, type: form.type||"Tasarım",
          priority: form.priority||"mid", due_date: form.due||"—", col: "todo",
        }).select().single();
        if(!error && data){
          setTasks(prev=>[...prev,{id:data.id,title:data.title,client:form.client||"",col:"todo",due:form.due}]);
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
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const cells = getMonthGrid(viewYear, viewMonth);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y=>y-1); }
    else setViewMonth(m=>m-1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y=>y+1); }
    else setViewMonth(m=>m+1);
  };
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  const isRealToday = (day, currentMonth) => currentMonth && viewYear===today.getFullYear() && viewMonth===today.getMonth() && day===today.getDate();
  const getWeekday = (cellIndex) => cellIndex % 7;
  
  const TR_WEEKDAY_INDEX = {Pazartesi:0,Salı:1,Çarşamba:2,Perşembe:3,Cuma:4,Cumartesi:5,Pazar:6};
  function getWeekdayIndex(dayName) {
    const map = {
      "pazartesi":"Pazartesi", "salı":"Salı", "sali":"Salı",
      "çarşamba":"Çarşamba", "carsamba":"Çarşamba",
      "perşembe":"Perşembe", "persembe":"Perşembe",
      "cuma":"Cuma", "cumartesi":"Cumartesi", "pazar":"Pazar",
    };
    const lower = dayName.trim().toLocaleLowerCase("tr-TR");
    const normalized = map[lower] || dayName.trim();
    return TR_WEEKDAY_INDEX[normalized];
  }

  return <div>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
      <button onClick={goPrevMonth} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>‹</button>
      <span style={{fontSize:15,fontWeight:600,color:T.textPrimary,flex:1}}>{TR_MONTHS[viewMonth]} {viewYear}</span>
      <button onClick={goToday} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.amberText,cursor:"pointer",fontSize:11,fontWeight:600}}>Bugün</button>
      <div style={{display:"flex",gap:12}}>
        {[{l:"Paylaşım",c:T.amberText},{l:"Çekim",c:"#F9A8D4"}].map(l=>(
          <div key={l.l} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textSecondary}}><div style={{width:8,height:8,borderRadius:2,background:l.c}}/>{l.l}</div>
        ))}
      </div>
      <button onClick={goNextMonth} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
      {["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map(d=><div key={d} style={{fontSize:11,color:T.textMuted,textAlign:"center",padding:"4px 0",fontWeight:600,letterSpacing:"0.04em"}}>{d}</div>)}
      {cells.map((cell,i)=>{
        const weekday = getWeekday(i);
        const isToday = isRealToday(cell.day, cell.currentMonth);
        const publishClients = cell.currentMonth ? clients.filter(c => c.publishDays.some(d => getWeekdayIndex(d) === weekday)) : [];
        const shootClients = cell.currentMonth ? clients.filter(c => c.shootDays.some(d => getWeekdayIndex(d) === weekday)) : [];
        return <div key={i} style={{
          minHeight:90,
          background:isToday?"rgba(34,58,89,0.4)":T.bgCard,
          border:`1px solid ${isToday?"#223A5988":T.border}`,
          borderRadius:10, padding:"6px 7px",
          opacity: cell.currentMonth ? 1 : 0.35,
        }}>
          <div style={{fontSize:12,fontWeight:isToday?700:400,color:isToday?T.indigoText:T.textSecondary,marginBottom:5}}>{cell.day}</div>
          {publishClients.slice(0,2).map((c,ci)=>(
            <div key={"p"+ci} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:"rgba(242,81,36,0.16)",color:T.amberText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid ${c.accentColor}`,fontWeight:600}}>{c.name}</div>
          ))}
          {shootClients.slice(0,2).map((c,ci)=>(
            <div key={"s"+ci} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:"rgba(236,72,153,0.16)",color:"#F9A8D4",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid ${c.accentColor}`,fontWeight:600}}>📷 {c.name}</div>
          ))}
          {(publishClients.length+shootClients.length)>4 && <div style={{fontSize:9,color:T.textMuted}}>+{publishClients.length+shootClients.length-4}</div>}
        </div>;
      })}
    </div>
  </div>;
}

// ─────────────────────────────────────────────
// STAFF PAGE
// ─────────────────────────────────────────────
function StaffPage({staff,setStaff}) {
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
      <StatCard label="Toplam Çalışan" value={staff.length} />
      <StatCard label="Tam Zamanlı" value={staff.filter(s=>s.type==="Tam zamanlı").length} color={T.greenText} />
      <StatCard label="Part-time" value={staff.filter(s=>s.type==="Part-time").length} color={T.amberText} />
      <StatCard label="Serbest" value={staff.filter(s=>s.type==="Serbest").length} color={T.indigoText} />
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
      {staff.map(s=>(
        <Card key={s.id} style={{padding:20}}>
          <Avatar initials={s.initials} color={s.color} size={46}/>
          <div style={{fontSize:14,fontWeight:600,color:T.textPrimary,marginTop:12}}>{s.name}</div>
          <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{s.role}</div>
        </Card>
      ))}
    </div>
  </div>;
}

const NAV=[
  {id:"clients",label:"Müşteriler",icon:"🏢"},
  {id:"calendar",label:"Takvim",icon:"📅"},
  {id:"tasks",label:"Görevler",icon:"📋"},
  {id:"staff",label:"Çalışanlar",icon:"👥"},
];

async function loadAllData() {
  const [
    { data: clientsRaw },
    { data: staffRaw },
    { data: tasksRaw },
    { data: postsRaw },
    { data: invoicesRaw },
    { data: mediaRaw },
  ] = await Promise.all([
    supabase.from('clients').select('*'),
    supabase.from('staff').select('*'),
    supabase.from('tasks').select('*'),
    supabase.from('posts').select('*'),
    supabase.from('invoices').select('*'),
    supabase.from('media').select('*'),
  ]);

  const clients = (clientsRaw || []).map(c => ({
    id: c.id, name: c.name, category: c.category || "", initials: c.initials || "",
    accentColor: c.accent_color || "#6366F1", phone: c.phone || "", address: c.address || "",
    city: c.city || "", district: c.district || "", taxNumber: c.tax_number || "", taxOffice: c.tax_office || "",
    platforms: c.platforms || [], publishDays: c.publish_days || [], shootDays: c.shoot_days || [],
    monthlyFee: c.monthly_fee || 0, contractStart: c.contract_start || "",
    posts: (postsRaw || []).filter(p => p.client_id === c.id).map(p => ({
      id: p.id, date: p.date, platform: p.platform, type: p.type, title: p.title, status: p.status, description: p.description,
    })),
    invoices: (invoicesRaw || []).filter(i => i.client_id === c.id).map(i => ({
      id: i.id, no: i.no, date: i.date, amount: i.amount, vat: i.vat, total: i.total, status: i.status, desc: i.description,
    })),
    media: (mediaRaw || []).filter(m => m.client_id === c.id).map(m => ({
      id: m.id, name: m.name, type: m.type, size: m.size, date: m.date,
    })),
  }));

  const staff = (staffRaw || []).map(s => ({
    id: s.id, name: s.name, role: s.role || "", initials: s.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase(),
    color: ["#6366F1", "#EC4899", "#10B981"][s.id % 3], type: s.type || "Tam zamanlı",
    email: s.email, phone: s.phone || "", start: s.start_date || "",
  }));

  const tasks = (tasksRaw || []).map(t => ({
    id: t.id, title: t.title, client: clients.find(c => c.id === t.client_id)?.name || "",
    type: t.type || "", priority: t.priority || "mid", due: t.due_date || "", col: t.col || "todo",
  }));

  return { clients, staff, tasks };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [page, setPage] = useState(() => localStorage.getItem('currentPage') || 'clients');
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    localStorage.setItem('currentPage', page);
  }, [page]);

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

  useEffect(() => {
    if (!session) return;
    supabase.from('staff').select('*').eq('auth_id', session.user.id).single()
      .then(({ data }) => setCurrentStaff(data));
  }, [session]);

  const refreshData = async () => {
    setDataLoading(true);
    const { clients, staff, tasks } = await loadAllData();
    setClients(clients);
    setStaff(staff);
    setTasks(tasks);
    setDataLoading(false);
  };

  useEffect(() => {
    if (session && currentStaff) refreshData();
  }, [session, currentStaff]);

  if (authLoading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Yükleniyor...</div>;
  if (!session || !currentStaff) return <Login onLogin={() => {}} />;

  if (dataLoading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Veriler yükleniyor...</div>;

  return <div style={{display:"flex",height:"100vh",background:T.bg,color:T.textPrimary,fontFamily:"'Inter',sans-serif"}}>
    <div style={{width:220,background:T.bgCard,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"16px 16px 14px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{marginBottom:6}}>
          <div style={{fontSize:16,fontWeight:700,color:T.amberText}}>📊 Panormos</div>
          <div style={{fontSize:13,fontWeight:700,color:T.amberText}}>medya</div>
        </div>
        <div style={{fontSize:9,color:T.textMuted,letterSpacing:"0.02em"}}>Medya Yönetim Paneli</div>
      </div>
      <div style={{flex:1,padding:"12px 8px"}}>
        {NAV.map(item=>(
          <div key={item.id} onClick={()=>setPage(item.id)} style={{
            display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,marginBottom:2,
            background:page===item.id?"rgba(34,58,89,0.45)":"transparent",
            border:`1px solid ${page===item.id?T.indigo+"88":"transparent"}`,
            color:page===item.id?"#A8C4DC":T.textSecondary,cursor:"pointer",fontSize:13,fontWeight:page===item.id?600:400,transition:"all 0.12s",
          }}>
            <span style={{fontSize:15}}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>

    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"14px 28px",borderBottom:`1px solid ${T.border}`,background:T.bgCard}}>
        <div style={{fontSize:18,fontWeight:700,color:T.textPrimary}}>
          {page === 'clients' ? '🏢 Müşteriler' : page === 'calendar' ? '📅 İçerik Takvimi' : page === 'tasks' ? '📋 Görevler' : '👥 Çalışanlar'}
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:28}}>
        {page==="clients"&&<ClientsPage clients={clients} setClients={setClients}/>}
        {page==="calendar"&&<CalendarPage clients={clients}/>}
        {page==="tasks"&&<TasksPage tasks={tasks} setTasks={setTasks} clients={clients} staff={staff}/>}
        {page==="staff"&&<StaffPage staff={staff} setStaff={setStaff}/>}
      </div>
    </div>
  </div>;
}
