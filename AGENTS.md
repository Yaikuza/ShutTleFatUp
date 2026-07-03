# Session notes — 3 Jul 2026

## Completed this session

### VS Custom Match Picker (`feat/vs-picker`)
- ปุ่ม VS + 🎯 เลือกคู่เอง (ghost button) เปิด modal เลือกคู่ 2+2
- 2 pages: 📋 จากตาราง (pair list from roundSchedule) + 👤 เลือกเอง (chip pool)
- Tab 1 = 📋 จากตาราง (default ถ้ามี schedule), fallback ไป Tab 2 ถ้า schedule ว่าง
- เลือก pair จาก schedule → → A / → B buttons
- Cross-court safety: confirm ก่อน override สนามที่กำลังเล่น
- Ad-hoc pairing fallback ใน `fillCourt` (ถ้า findScheduledMatch ไม่เจอ)
- Picker แสดงเฉพาะคนในคิว (`data.queue`) ไม่ใช่ผู้เล่นทั้งหมด

### Realistic Court Lines (SVG)
- แทนที่ `::before`/`::after` ด้วย SVG background (viewBox 1340×610, landscape 13.4×6.1)
- เส้นข้างคู่เดี่ยว, เส้นเสิร์ฟสั้น/ยาว, เส้นกลาง, ตาข่าย — scale จริง (cm-based)
- ลบ pseudo-elements ที่ซ้อนทับทั้งหมด

### Game Label per Team
- แสดง `เกมX` ในแต่ละทีม zone (grid 1fr auto 1fr = ผู้เล่น, เกม, ผู้เล่น)
- ใช้ `data.roundPairs[key(pair)]` — persist ข้าม match (ไม่ reset ตอน match จบ)
- VS badge กลับมาที่กึ่งกลางระหว่างทีม

### Theme System
- 4 ธีม: ☀️ สว่าง, 🌙 มืด, 🌸 Pastel, 📜 Sepia
- Settings dropdown ธีม
- Bottom bar buttons ใช้ CSS variables แทน hardcoded colors
- applyTheme() ตั้ง `document.documentElement.className` ทุก render

### Custom Confirm Dialog
- แทนที่ `window.confirm()` ทั้ง 5 จุดด้วย `confirmDialog()` Promise-based
- Show "ShutTle Fat Up" แทน origin URL
- กล่อง dialog ตามธีม

### Dead Code Cleanup
- ลบ 13 CSS rules, 4 JS functions, 1 unused id
- ลบ `removeFromQueue`, `canPair`, `isAnyCourtPlaying`, `showTeam`
- ลบ `.toggle-switch`, `.queue-players`, duplicate `.toast`, etc.

### Bug Fixes (`fix/bugs`)
- หลัง declareWinner, "No opponents available": winner-stays → สร้างคู่จากคิว (ad-hoc)
- "Both at limit": fillCourt อัตโนมัติ
- ลบ pair ที่เพิ่งเล่นออกจาก roundSchedule → ป้องกันจับคู่เดิมซ้ำ (reverted แล้ว改用 winner-stays logic)
- Picker แสดงเฉพาะคนในคิว ไม่ใช่ mainPlayers ทั้งหมด
- Bottom bar button borders visibility (rgba(255,255,255,.3) for gradient buttons)
- Bottom bar button padding/larger on mobile
- `.court-card` padding top แทน bottom
- `.courts` grid padding top แทน bottom
- Empty court badge "ว่าง"/"รอคู่" ที่ header แทนข้อความในสนาม
- `#newPlayerInput` fallback ลบ (element ไม่มีอยู่)

### Merged
- `feat/vs-picker` → master
- `fix/bugs` → master

## Current state
- Branch: master (clean)
- Functions as async: `fillCourt`, `declareWinner`, `swapBoth`, `openCustomMatchPicker`, `removePlayer`, `resetSession`, `deleteAllData`, `checkAndAutoRound`

## Next session priorities

### 1. Round completion logic (P0)
- ปัจจุบัน: new round เริ่มเมื่อ schedule ทั้งหมด exhausted
- ที่ต้องการ: เมื่อคอร์ทสุดท้ายเล่นครบ gamesPerMatch → เริ่มรอบใหม่
- ถ้าอีกคอร์ทยังเล่นอยู่ → ต้องรอคอร์ทนั้นให้จบก่อน หรือเริ่มรอบใหม่โดยไม่รวมคนในคอร์ทนั้น
- โจทย์: sync รอบระหว่างหลายคอร์ท, เช็คว่าทุกคอร์ทว่างเมื่อไหร่

### 2. Stats & Settings as sticky footer
- จาก bottom sheet → เป็น footer ติดอยู่ด้านล่างสุดของหน้า
- ปุ่ม 📊 สถิติ + ⚙️ ตั้งค่า อยู่ bottom fixed
- คลิกแล้วเลื่อน content ขึ้นมาแทน (หรือแสดงในพื้นที่ footer เลย)

### 3. ดีไซน์สถิติ
- จัดรูปแบบการแสดงสถิติใหม่ (ตารางคู่, คู่แข่ง, เกม, ประวัติ)
- ปรับ UI / layout ให้ดูดีขึ้น
