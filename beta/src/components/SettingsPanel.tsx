import { useState } from "react";
import type { Settings } from "../domain/types";
import type { SyncStatus } from "../supabase/useRoomSync";

export function SettingsPanel({
  settings,
  configured,
  roomCode: connectedRoomCode,
  syncStatus,
  syncMessage,
  onSettingsChange,
  onExport,
  onImport,
  onReset,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom
}: {
  settings: Settings;
  configured: boolean;
  roomCode?: string;
  syncStatus: SyncStatus;
  syncMessage: string;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onExport: () => void;
  onImport: (file?: File) => void;
  onReset: () => void;
  onCreateRoom: (code: string) => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
}) {
  const [code, setCode] = useState("");
  const ready = code.length === 6 && syncStatus !== "connecting";

  return (
    <section className="settings-panel">
      <label>
        <span>จำนวนเกมต่อคู่</span>
        <select value={settings.gamesPerPair} onChange={event =>
          onSettingsChange({ gamesPerPair: Number(event.target.value) })
        }>
          {[1, 2, 3, 4].map(value => <option key={value} value={value}>{value} เกม</option>)}
        </select>
      </label>
      <label>
        <span>จำนวนคอร์ท</span>
        <select value={settings.courtCount} onChange={event =>
          onSettingsChange({ courtCount: Number(event.target.value) })
        }>
          {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value} คอร์ท</option>)}
        </select>
      </label>
      <label className="toggle-row">
        <span>Hellven Mode</span>
        <input type="checkbox" checked={settings.hellvenMode} onChange={event =>
          onSettingsChange({ hellvenMode: event.target.checked })
        } />
      </label>
      <label>
        <span>โหมดคนน้อย</span>
        <select value={settings.lowPlayerMode} onChange={event =>
          onSettingsChange({ lowPlayerMode: event.target.value as Settings["lowPlayerMode"] })
        }>
          <option value="auto">อัตโนมัติ</option><option value="on">เปิดตลอด</option>
          <option value="off">ปิด</option>
        </select>
      </label>
      <label>
        <span>เกณฑ์คนน้อย</span>
        <select value={settings.lowPlayerThreshold} onChange={event =>
          onSettingsChange({ lowPlayerThreshold: Number(event.target.value) })
        }>
          {[4, 6, 8, 10].map(value => <option key={value} value={value}>{value} คน</option>)}
        </select>
      </label>
      <label>
        <span>ธีม</span>
        <select value={settings.theme} onChange={event =>
          onSettingsChange({ theme: event.target.value as Settings["theme"] })
        }>
          <option value="light">สว่าง</option><option value="dark">มืด</option>
          <option value="pastel">Pastel</option><option value="sepia">Sepia</option>
        </select>
      </label>
      <label>
        <span>สีสนาม</span>
        <input type="color" value={settings.courtColor} onChange={event =>
          onSettingsChange({ courtColor: event.target.value })
        } />
      </label>
      <label>
        <span>คอลัมน์สนาม</span>
        <select value={settings.courtColumns} onChange={event =>
          onSettingsChange({ courtColumns: Number(event.target.value) as Settings["courtColumns"] })
        }>
          <option value="0">อัตโนมัติ</option><option value="1">1</option>
          <option value="2">2</option><option value="3">3</option>
        </select>
      </label>
      <div className="data-actions">
        <button className="ghost" onClick={onExport}>Export</button>
        <label className="ghost file-button">
          Import
          <input type="file" accept=".json" onChange={event => onImport(event.target.files?.[0])} />
        </label>
        <button className="ghost danger" onClick={onReset}>รีเซต Session</button>
      </div>
      <div className="room-settings">
        <div>
          <strong>ห้อง Realtime</strong>
          <small>{configured
            ? connectedRoomCode ? `เชื่อมต่อห้อง ${connectedRoomCode}` : "สร้างหรือเข้าห้องเพื่อ sync หลายเครื่อง"
            : "ยังไม่ได้ตั้งค่า Supabase"}</small>
        </div>
        {configured && !connectedRoomCode && (
          <div className="room-actions">
            <input
              value={code}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="รหัสตัวเลข 6 หลัก"
              onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <button className="ghost" disabled={!ready} onClick={() => onCreateRoom(code)}>สร้างห้องนี้</button>
            <button className="ghost" disabled={!ready} onClick={() => onJoinRoom(code)}>เข้าห้อง</button>
          </div>
        )}
        {connectedRoomCode && <button className="ghost" onClick={onLeaveRoom}>ออกจากห้อง</button>}
        {syncMessage && <p role="alert">{syncMessage}</p>}
      </div>
    </section>
  );
}
