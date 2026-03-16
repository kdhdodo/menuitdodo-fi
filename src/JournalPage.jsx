import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

export default function JournalPage() {
  const [records, setRecords] = useState([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [viewData, setViewData] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const fileRef = useRef();

  useEffect(() => { loadBatches(); }, []);

  async function loadBatches() {
    // batch_id별로 그룹핑 — 페이지네이션으로 전체 수집
    const map = {};
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("batch_id, upload_date, file_name")
        .order("id")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      data.forEach(r => {
        if (!r.batch_id) return;
        if (!map[r.batch_id]) map[r.batch_id] = { batch_id: r.batch_id, upload_date: r.upload_date, file_name: r.file_name, count: 0 };
        map[r.batch_id].count++;
      });
      if (data.length < 1000) break;
      from += 1000;
    }
    // batch_id가 없는 레거시 데이터도 하나로 묶기
    let legacyFrom = 0, legacyCount = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("id")
        .is("batch_id", null)
        .range(legacyFrom, legacyFrom + 999);
      if (!data || data.length === 0) break;
      legacyCount += data.length;
      if (data.length < 1000) break;
      legacyFrom += 1000;
    }
    if (legacyCount > 0) {
      map["__legacy__"] = { batch_id: "__legacy__", upload_date: "이전 데이터", file_name: "batch_id 없음", count: legacyCount };
    }

    const list = Object.values(map).sort((a, b) => {
      if (a.batch_id === "__legacy__") return 1;
      if (b.batch_id === "__legacy__") return -1;
      return b.batch_id.localeCompare(a.batch_id);
    });
    setBatches(list);
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
      setMessage(`${parsed.length}건 파싱 완료. 업로드 버튼을 눌러주세요.`);
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleUpload() {
    if (records.length === 0) return;
    setUploading(true);
    setMessage("업로드 중...");

    const today = new Date().toISOString().slice(0, 10);
    const batchId = `${today}_${Date.now()}`;
    const batch = records.map(r => ({ ...r, upload_date: today, batch_id: batchId, file_name: fileName }));

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
    loadBatches();
  }

  async function handleViewBatch(batchId) {
    setSelectedBatch(batchId);
    setViewLoading(true);
    let all = [], from = 0;
    while (true) {
      let query = supabase.from("journals").select("*");
      if (batchId === "__legacy__") {
        query = query.is("batch_id", null);
      } else {
        query = query.eq("batch_id", batchId);
      }
      const { data } = await query.order("entry_date").order("slip_no").range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    setViewData(all);
    setViewLoading(false);
  }

  async function handleDelete(batchId) {
    if (!confirm("이 업로드를 삭제하시겠습니까?")) return;
    setDeleting(batchId);
    // 1000건씩 삭제
    while (true) {
      let query = supabase.from("journals").delete();
      if (batchId === "__legacy__") {
        query = query.is("batch_id", null);
      } else {
        query = query.eq("batch_id", batchId);
      }
      const { data, error } = await query.select("id").limit(1000);
      if (error) { alert(`삭제 실패: ${error.message}`); break; }
      if (!data || data.length === 0) break;
    }
    setDeleting(null);
    if (selectedBatch === batchId) {
      setSelectedBatch(null);
      setViewData([]);
    }
    loadBatches();
  }

  const cardStyle = { background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, marginBottom: 20 };
  const labelStyle = { fontSize: 13, color: "#4a4d5e", marginBottom: 8 };
  const btnStyle = { background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", color: "#fff", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
  const delBtnStyle = { background: "transparent", border: "1px solid #ff6b6b", color: "#ff6b6b", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", marginLeft: 8 };

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
        {batches.length === 0 ? (
          <div style={{ fontSize: 13, color: "#4a4d5e" }}>아직 업로드된 분개장이 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {batches.map(b => (
              <div key={b.batch_id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: selectedBatch === b.batch_id ? "rgba(124,92,252,0.1)" : "#1a1d2a",
                border: selectedBatch === b.batch_id ? "1px solid #7c5cfc" : "1px solid #1e2130",
                borderRadius: 8, padding: "10px 16px", cursor: "pointer",
              }}>
                <div onClick={() => handleViewBatch(b.batch_id)} style={{ flex: 1, cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: selectedBatch === b.batch_id ? "#fff" : "#8a8ea0" }}>
                    {b.upload_date} — {b.file_name || "파일명 없음"}
                  </div>
                  <div style={{ fontSize: 11, color: "#4a4d5e", marginTop: 2 }}>
                    {b.count.toLocaleString()}건
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(b.batch_id); }}
                  disabled={deleting === b.batch_id}
                  style={{ ...delBtnStyle, opacity: deleting === b.batch_id ? 0.5 : 1 }}
                >
                  {deleting === b.batch_id ? "삭제 중..." : "삭제"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 배치별 데이터 조회 */}
        {selectedBatch && (
          <div style={{ marginTop: 20, overflowX: "auto" }}>
            {viewLoading ? (
              <div style={{ color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "#8a8ea0", marginBottom: 12 }}>
                  조회 결과 — <span style={{ color: "#4ecdc4" }}>{viewData.length.toLocaleString()}건</span>
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
