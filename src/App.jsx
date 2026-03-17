import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import JournalPage from "./JournalPage";
import BalancePage from "./BalancePage";
import InventoryPage from "./InventoryPage";
import SalesPage from "./SalesPage";
import SettlementPage from "./SettlementPage";
import AdminPage from "./AdminPage";

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";

const TABS = [
  { key: "journal", label: "분개장" },
  { key: "balance", label: "잔고" },
  { key: "inventory", label: "재고" },
  { key: "sales", label: "영업" },
  { key: "settlement", label: "정산" },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("user"); // "user" | "admin"
  const [tab, setTab] = useState("journal");
  const viewInitialized = useRef(false);

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const at = params.get("access_token"), rt = params.get("refresh_token");
      if (at && rt) {
        await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        window.history.replaceState(null, "", window.location.pathname);
      }
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    }
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadProfile(s.user.id, false);
      else { setProfile(null); setLoading(false); viewInitialized.current = false; }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(uid, setViewOnLoad = true) {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile(data);
    if (setViewOnLoad && !viewInitialized.current) {
      const r = data?.role || "user";
      const isAdmin = r === "super_admin" || r === "admin";
      setView(isAdmin ? "admin" : "user");
      viewInitialized.current = true;
    }
    setLoading(false);
  }

  if (loading) return <div style={{ minHeight: "100vh", background: "#0d0f14", display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4d5e", fontFamily: FONT }}>로딩 중...</div>;
  if (!session) return <Login />;

  const rawRole = profile?.role || "user";
  const isAdmin = rawRole === "super_admin" || rawRole === "admin";

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", fontFamily: FONT, color: "#e8eaf0" }}>
      {/* 헤더 */}
      <div style={{ background: "#11141c", borderBottom: "1px solid #1e2130", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>메뉴잇 재무 관리</div>
          {view === "user" && (
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  background: tab === t.key ? "rgba(124,92,252,0.15)" : "transparent",
                  border: "none",
                  color: tab === t.key ? "#7c5cfc" : "#4a4d5e",
                  borderRadius: 7,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: tab === t.key ? 700 : 500,
                  cursor: "pointer",
                }}>{t.label}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#4a4d5e" }}>{profile?.name || session.user.email}</span>
          {isAdmin && view === "user" && (
            <button onClick={() => setView("admin")}
              style={{ background: "transparent", border: "1px solid #1e2130", color: "#7c5cfc", borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              관리자 &gt;
            </button>
          )}
          {isAdmin && view === "admin" && (
            <button onClick={() => setView("user")}
              style={{ background: "transparent", border: "1px solid #1e2130", color: "#4a9eff", borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              &lt; 사용자
            </button>
          )}
          <button onClick={() => supabase.auth.signOut()} style={{ background: "transparent", border: "1px solid #1e2130", color: "#4a4d5e", borderRadius: 7, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>로그아웃</button>
        </div>
      </div>

      {/* 페이지 */}
      {view === "user" && tab === "journal" && <JournalPage />}
      {view === "user" && tab === "balance" && <BalancePage />}
      {view === "user" && tab === "inventory" && <InventoryPage />}
      {view === "user" && tab === "sales" && <SalesPage />}
      {view === "user" && tab === "settlement" && <SettlementPage />}
      {view === "admin" && <AdminPage />}
    </div>
  );
}
