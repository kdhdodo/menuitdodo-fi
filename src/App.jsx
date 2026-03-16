import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const at = params.get("access_token"), rt = params.get("refresh_token");
      if (at && rt) {
        await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        window.history.replaceState(null, "", window.location.pathname);
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session); setLoading(false);
    }
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  if (loading) return <div style={{ minHeight:"100vh",background:"#0d0f14",display:"flex",alignItems:"center",justifyContent:"center",color:"#4a4d5e",fontFamily:"'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}>로딩 중...</div>;
  if (!session) return <Login />;
  return (
    <div style={{ minHeight:"100vh",background:"#0d0f14",fontFamily:"'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",color:"#e8eaf0" }}>
      <div style={{ background:"#11141c",borderBottom:"1px solid #1e2130",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56 }}>
        <div style={{ fontSize:16,fontWeight:800,background:"linear-gradient(135deg,#7c5cfc,#4a9eff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>메뉴잇 재무 관리</div>
        <button onClick={() => supabase.auth.signOut()} style={{ background:"transparent",border:"1px solid #1e2130",color:"#4a4d5e",borderRadius:7,padding:"6px 14px",fontSize:13,cursor:"pointer" }}>로그아웃</button>
      </div>
      <div style={{ maxWidth:800,margin:"80px auto",textAlign:"center",padding:"0 24px" }}>
        <div style={{ fontSize:48,marginBottom:20 }}>🚧</div>
        <div style={{ fontSize:24,fontWeight:800,color:"#e8eaf0",marginBottom:12 }}>준비 중입니다</div>
        <div style={{ fontSize:14,color:"#4a4d5e" }}>재무 관리 시스템을 준비하고 있습니다.</div>
      </div>
    </div>
  );
}
