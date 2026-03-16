import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  // 앞쪽 빈칸
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  return days;
}

function pad(n) { return String(n).padStart(2, "0"); }

export default function JournalPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [uploadedDates, setUploadedDates] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [records, setRecords] = useState([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [viewData, setViewData] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef();

  const days = getCalendarDays(year, month);

  useEffect(() => { loadMonth(); }, [year, month]);

  async function loadMonth() {
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${new Date(year, month + 1, 0).getDate()}`;
    const map = {};
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("upload_date, batch_id, file_name")
        .gte("upload_date", startDate)
        .lte("upload_date", endDate)
        .order("id")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      data.forEach(r => {
        const d = r.upload_date;
        if (!map[d]) map[d] = { count: 0, batch_id: r.batch_id, file_name: r.file_name };
        map[d].count++;
      });
      if (data.length < 1000) break;
      from += 1000;
    }
    setUploadedDates(map);
  }

  function handleDayClick(day) {
    if (!day) return;
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    setSelectedDate(dateStr);
    setRecords([]);
    setFileName("");
    setMessage(null);
    if (fileRef.current) fileRef.current.value = "";
    if (uploadedDates[dateStr]) {
      loadDayData(dateStr);
    } else {
      setViewData([]);
    }
  }

  async function loadDayData(dateStr) {
    setViewLoading(true);
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("*")
        .eq("upload_date", dateStr)
        .order("entry_date")
        .order("slip_no")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    setViewData(all);
    setViewLoading(false);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMessage(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
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
      setMessage(`${parsed.length}건 파싱 완료`);
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleUpload() {
    if (records.length === 0 || !selectedDate) return;
    setUploading(true);
    setMessage("업로드 중...");

    const batchId = `${selectedDate}_${Date.now()}`;
    const batch = records.map(r => ({ ...r, upload_date: selectedDate, batch_id: batchId, file_name: fileName }));

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
      setMessage(`업로드 중... ${total}/${batch.length}건`);
    }

    setMessage(`${total}건 업로드 완료!`);
    setRecords([]);
    setFileName("");
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    loadMonth();
    loadDayData(selectedDate);
  }

  async function handleDelete() {
    if (!selectedDate) return;
    if (!confirm(`${selectedDate} 분개장을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    while (true) {
      const { data, error } = await supabase
        .from("journals")
        .delete()
        .eq("upload_date", selectedDate)
        .select("id")
        .limit(1000);
      if (error) { alert(`삭제 실패: ${error.message}`); break; }
      if (!data || data.length === 0) break;
    }
    setDeleting(false);
    setViewData([]);
    loadMonth();
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null); setViewData([]); setRecords([]);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null); setViewData([]); setRecords([]);
  }

  const hasData = selectedDate && uploadedDates[selectedDate];
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      {/* 달력 (위) */}
      <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button onClick={prevMonth} style={navBtn}>&lt;</button>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{year}년 {month + 1}월</div>
          <button onClick={nextMonth} style={navBtn}>&gt;</button>
        </div>
        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: i === 0 ? "#ff6b6b" : i === 6 ? "#4a9eff" : "#4a4d5e", padding: "6px 0" }}>{w}</div>
          ))}
        </div>
        {/* 날짜 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {days.map((day, i) => {
            if (!day) return <div key={`e${i}`} />;
            const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === todayStr;
            const hasUpload = !!uploadedDates[dateStr];
            const dayOfWeek = (i) % 7;
            return (
              <div
                key={i}
                onClick={() => handleDayClick(day)}
                style={{
                  position: "relative",
                  textAlign: "center",
                  padding: "10px 0",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: isSelected ? 800 : 500,
                  background: isSelected ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : isToday ? "rgba(124,92,252,0.1)" : "transparent",
                  color: isSelected ? "#fff" : dayOfWeek === 0 ? "#ff6b6b" : dayOfWeek === 6 ? "#4a9eff" : "#e8eaf0",
                  border: isToday && !isSelected ? "1px solid #7c5cfc" : "1px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {day}
                {hasUpload && (
                  <div style={{
                    position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                    width: 6, height: 6, borderRadius: "50%",
                    background: isSelected ? "#fff" : "#4ecdc4",
                  }} />
                )}
              </div>
            );
          })}
        </div>
        {/* 범례 */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 11, color: "#4a4d5e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ecdc4" }} /> 업로드 완료
          </div>
        </div>
      </div>

      {/* 분개장 패널 (아래) */}
      {!selectedDate ? (
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#4a4d5e" }}>날짜를 선택하세요</div>
        </div>
      ) : (
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedDate}</div>
            {hasData && (
              <button onClick={handleDelete} disabled={deleting} style={{
                background: "transparent", border: "1px solid #ff6b6b", color: "#ff6b6b",
                borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                opacity: deleting ? 0.5 : 1,
              }}>
                {deleting ? "삭제 중..." : "분개장 삭제"}
              </button>
            )}
          </div>

          {hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", background: "rgba(78,205,196,0.08)", borderRadius: 8, border: "1px solid rgba(78,205,196,0.2)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ecdc4" }} />
                <span style={{ fontSize: 13, color: "#4ecdc4", fontWeight: 600 }}>
                  {uploadedDates[selectedDate].file_name || "파일명 없음"} — {uploadedDates[selectedDate].count.toLocaleString()}건
                </span>
              </div>
              {viewLoading ? (
                <div style={{ color: "#4a4d5e", fontSize: 13, padding: 20, textAlign: "center" }}>불러오는 중...</div>
              ) : (
                <div style={{ maxHeight: 500, overflowY: "auto", overflowX: "auto" }}>
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
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#4a4d5e", marginBottom: 12 }}>이 날짜에 분개장이 없습니다. 엑셀 파일을 업로드하세요.</div>
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
                  style={{
                    background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", color: "#fff",
                    borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    opacity: uploading || records.length === 0 ? 0.5 : 1,
                  }}
                >
                  {uploading ? "업로드 중..." : `업로드 (${records.length}건)`}
                </button>
              </div>
              {message && (
                <div style={{ marginTop: 12, fontSize: 13, color: message.includes("실패") ? "#ff6b6b" : "#4ecdc4" }}>
                  {message}
                </div>
              )}
              {records.length > 0 && (
                <div style={{ marginTop: 16, overflowX: "auto" }}>
                  <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 8 }}>미리보기 (상위 10건)</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2130" }}>
                        {["일자", "전표번호", "구분", "계정과목", "차변", "대변", "적요", "거래처명"].map(h => (
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
                          <td style={{ padding: "6px" }}>{r.account_name}</td>
                          <td style={{ padding: "6px", textAlign: "right", color: "#4ecdc4" }}>{r.debit ? r.debit.toLocaleString() : ""}</td>
                          <td style={{ padding: "6px", textAlign: "right", color: "#ff6b9d" }}>{r.credit ? r.credit.toLocaleString() : ""}</td>
                          <td style={{ padding: "6px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.summary}</td>
                          <td style={{ padding: "6px", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendor_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const navBtn = {
  background: "transparent", border: "1px solid #1e2130", color: "#8a8ea0",
  borderRadius: 7, padding: "6px 12px", fontSize: 16, cursor: "pointer", fontWeight: 700,
};
