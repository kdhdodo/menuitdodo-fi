import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const ROLES = [
  { value: "admin",    label: "관리자", color: "#7c5cfc" },
  { value: "user",     label: "사용자", color: "#4a9eff" },
];
const roleColor = Object.fromEntries(ROLES.map(r => [r.value, r.color]));

const ADMIN_FN = "https://djnsbwsguqirskimukxh.supabase.co/functions/v1/invite-user";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbnNid3NndXFpcnNraW11a3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Njg3MzEsImV4cCI6MjA4OTE0NDczMX0.PkHZQsAUVzOj6c6NaEgvyfPcF6e1m7JbnNTta7ZaNjQ";
const adminFetch = (body) => fetch(ADMIN_FN, { method: "POST", headers: { "Content-Type": "application/json", "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` }, body: JSON.stringify(body) }).then(r => r.json());

export default function AdminPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ email: "", role: "user" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setMembers(data || []);
    setLoading(false);
  }

  async function invite() {
    if (!form.email.trim()) return;
    setSaving(true); setError("");
    const { error: err } = await adminFetch({ action: "invite", email: form.email.trim(), role: form.role });
    if (err) { setError(err); setSaving(false); return; }
    setForm({ email: "", role: "user" });
    setShowInvite(false); setSaving(false);
    setTimeout(load, 1000);
  }

  async function changeRole(id, role) {
    await supabase.from("profiles").update({ role }).eq("id", id);
    load();
  }

  async function removeMember(id) {
    if (!confirm("이 회원을 삭제하시겠습니까?")) return;
    const { error } = await adminFetch({ action: "delete", userId: id });
    if (error) { alert(error); return; }
    load();
  }

  const filtered = members.filter(m =>
    !search || m.email?.includes(search) || m.name?.includes(search)
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#e8eaf0", marginBottom: 24 }}>회원 관리</div>

      {/* 툴바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#4a4d5e" }}>총 {members.length}명</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름 / 이메일 검색"
            style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 14px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit", width: 200 }} />
          <button onClick={() => { setShowInvite(v => !v); setError(""); }}
            style={{ background: showInvite ? "#2a2d3a" : "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", borderRadius: 7, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {showInvite ? "취소" : "+ 초대"}
          </button>
        </div>
      </div>

      {/* 초대 폼 */}
      {showInvite && (
        <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
          {error && <div style={{ color: "#ff5050", fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="이메일"
              style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ background: "#0d0f14", border: "1px solid #1e2130", borderRadius: 7, padding: "8px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", fontFamily: "inherit" }}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={invite} disabled={saving || !form.email.trim()}
              style={{ background: form.email.trim() ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#2a2d3a", border: "none", borderRadius: 7, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {saving ? "..." : "초대"}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div style={{ background: "#11141c", border: "1px solid #1e2130", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", padding: "10px 16px", borderBottom: "1px solid #1e2130", fontSize: 11, color: "#4a4d5e", fontWeight: 700 }}>
          <div>이메일</div><div>이름</div><div>권한</div><div></div>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#4a4d5e", fontSize: 13 }}>회원이 없습니다</div>
        ) : filtered.map(m => (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", padding: "12px 16px", borderBottom: "1px solid #1e2130", alignItems: "center", fontSize: 13 }}>
            <div style={{ color: "#e8eaf0", display: "flex", alignItems: "center", gap: 8 }}>
              {m.email || "—"}
              {!m.name && <span style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b55", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>가입 대기중</span>}
            </div>
            <div style={{ color: "#8890a4" }}>{m.name || "—"}</div>
            <div>
              {m.role === "super_admin" ? (
                <span style={{ background: "#7c5cfc22", color: "#7c5cfc", border: "1px solid #7c5cfc55", borderRadius: 5, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>총관리자</span>
              ) : (
                <select value={m.role || "user"} onChange={e => changeRole(m.id, e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${roleColor[m.role] || "#4a4d5e"}`, borderRadius: 5, padding: "3px 8px", color: roleColor[m.role] || "#4a4d5e", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}
            </div>
            <button onClick={() => removeMember(m.id)} disabled={m.role === "super_admin"}
              style={{ background: m.role === "super_admin" ? "transparent" : "rgba(255,80,80,0.1)", border: `1px solid ${m.role === "super_admin" ? "transparent" : "rgba(255,80,80,0.2)"}`, color: m.role === "super_admin" ? "transparent" : "#ff5050", borderRadius: 5, padding: "3px 10px", fontSize: 12, cursor: m.role === "super_admin" ? "default" : "pointer" }}>
              삭제
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
