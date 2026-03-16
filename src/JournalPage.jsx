import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

export default function JournalPage() {
  const [records, setRecords] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewData, setViewData] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const fileRef = useRef();

  // 업로드 날짜 목록 불러오기
  useEffect(() => { loadDates(); }, []);

  async function loadDates() {
    const { data } = await supabase
      .from("journals")
      .select("upload_date")
      .order("upload_date", { ascending: false });
    if (data) {
      const unique = [...new Set(data.map(r => r.upload_date))];
      setDates(unique);
    }
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMessage(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      // 헤더 2줄 스킵, 데이터부터 파싱
      const parsed = [];
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        parsed.push({
          entry_date: r[0],
          slip_no: r[1] || "",
          division: r[2] || "",
          account_code: r[3] || "",
          account_name: r[4] || "",
          debit: Number(r[5]) || 0,
          credit: Number(r[6]) || 0,
          summary: r[7] || "",
          vendor_code: r[8] || "",
          vendor_name: r[9] || "",
          biz_no: r[10] || "",
          representative: r[11] || "",
          entry_type: r[19] || "",
        });
      }
      setRecords(parsed);
      setMessage(`${parsed.length}건 파싱 완료. 업로드 버튼을 눌러주세요.`);
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleUpload() {
    if (records.length === 0) return;
    setUploading(true);
    setMessage("업로드 중...");

    const today = new Date().toISOString().slice(0, 10);
    const batch = records.map(r => ({ ...r, upload_date: today }));

    // 500건씩 나눠서 업로드
    let total = 0;
    for (let i = 0; i < batch.length; i += 500) {
      const chunk = batch.slice(i, i + 500);
      const { error } = await supabase.from("journals").insert(chunk);
      if (error) {
        setMessage(`업로드 실패: ${error.message}`);
        setUploading(false);
        return;
      }
      total += chunk.length;
    }

    setMessage(`${total}건 업로드 완료!`);
    setRecords([]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    loadDates();
  }

  async function handleViewDate(date) {
    setSelectedDate(date);
    setViewLoading(true);
    const { data } = await supabase
      .from("journals")
      .select("*")
      .eq("upload_date", date)
      .order("entry_date")
      .order("slip_no");
    setViewData(data || []);
    setViewLoading(false);
  }

  const cardStyle = { background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, marginBottom: 20 };
  const labelStyle = { fontSize: 13, color: "#4a4d5e", marginBottom: 8 };
  const btnStyle = { background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", color: "#fff", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
      {/* 업로드 섹션 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>분개장 업로드</div>
        <div style={labelStyle}>엑셀 파일(.xlsx)을 선택하세요</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            style={{ fontSize: 13, color: "#8a8ea0" }}
          />
          <button
            onClick={handleUpload}
            disabled={uploading || records.length === 0}
            style={{ ...btnStyle, opacity: uploading || records.length === 0 ? 0.5 : 1 }}
          >
            {uploading ? "업로드 중..." : `DB에 저장 (${records.length}건)`}
          </button>
        </div>
        {message && (
          <div style={{ marginTop: 12, fontSize: 13, color: message.includes("실패") ? "#ff6b6b" : "#4ecdc4" }}>
            {message}
          </div>
        )}

        {/* 미리보기 */}
        {records.length > 0 && (
          <div style={{ marginTop: 20, overflowX: "auto" }}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>미리보기 (상위 10건)</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e2130" }}>
                  {["일자", "전표번호", "구분", "계정코드", "계정과목", "차변", "대변", "적요", "거래처명", "유형"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: "#4a4d5e", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 10).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #1a1d2a" }}>
                    <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{r.entry_date}</td>
                    <td style={{ padding: "6px" }}>{r.slip_no}</td>
                    <td style={{ padding: "6px", color: r.division === "차변" ? "#4ecdc4" : "#ff6b9d" }}>{r.division}</td>
                    <td style={{ padding: "6px", color: "#4a4d5e" }}>{r.account_code}</td>
                    <td style={{ padding: "6px" }}>{r.account_name}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#4ecdc4" }}>{r.debit ? r.debit.toLocaleString() : ""}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "#ff6b9d" }}>{r.credit ? r.credit.toLocaleString() : ""}</td>
                    <td style={{ padding: "6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.summary}</td>
                    <td style={{ padding: "6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendor_name}</td>
                    <td style={{ padding: "6px", color: "#4a4d5e", fontSize: 11 }}>{r.entry_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 업로드 이력 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>업로드 이력</div>
        {dates.length === 0 ? (
          <div style={{ fontSize: 13, color: "#4a4d5e" }}>아직 업로드된 분개장이 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {dates.map(d => (
              <button
                key={d}
                onClick={() => handleViewDate(d)}
                style={{
                  background: selectedDate === d ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#1a1d2a",
                  border: selectedDate === d ? "none" : "1px solid #1e2130",
                  color: selectedDate === d ? "#fff" : "#8a8ea0",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        {/* 날짜별 데이터 조회 */}
        {selectedDate && (
          <div style={{ marginTop: 20, overflowX: "auto" }}>
            {viewLoading ? (
              <div style={{ color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "#8a8ea0", marginBottom: 12 }}>
                  {selectedDate} 업로드 — <span style={{ color: "#4ecdc4" }}>{viewData.length}건</span>
                </div>
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2130", position: "sticky", top: 0, background: "#11141c" }}>
                        {["일자", "전표번호", "구분", "계정과목", "차변", "대변", "적요", "거래처명"].map(h => (
                          <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: "#4a4d5e", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewData.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #1a1d2a" }}>
                          <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{r.entry_date}</td>
                          <td style={{ padding: "6px" }}>{r.slip_no}</td>
                          <td style={{ padding: "6px", color: r.division === "차변" ? "#4ecdc4" : "#ff6b9d" }}>{r.division}</td>
                          <td style={{ padding: "6px" }}>{r.account_name}</td>
                          <td style={{ padding: "6px", textAlign: "right", color: "#4ecdc4" }}>{r.debit ? Number(r.debit).toLocaleString() : ""}</td>
                          <td style={{ padding: "6px", textAlign: "right", color: "#ff6b9d" }}>{r.credit ? Number(r.credit).toLocaleString() : ""}</td>
                          <td style={{ padding: "6px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.summary}</td>
                          <td style={{ padding: "6px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendor_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
