# Session notes — 16 Jul 2026

## Completed this session

### Hellven Mode (`feat/hellven-mode`)
- ผู้เล่นมีระดับ: 🔥 Hell / 😇 Heaven / 🧑 Human — `data.playerLevel[p]`
- สนามแบ่งระดับ cyclically: สนาม 1=Hell, 2=Heaven, 3=Human, 4=Hell...
- Settings toggle `hellvenMode` — default off
- กฎการจับคู่: Hell vs Heaven **ห้าม** (ยกเว้น mixed team), Human จับกับใครก็ได้
- `pairByLevel()` — จับคู่แยก Hell pool (Hell+Human) และ Heaven pool (Heaven+Human)
- Player list → `player-chip` (tag style) พร้อม level toggle + level cycle button
- Queue chips, pair score table, court header แสดง level icon/badge
- Picker filter เฉพาะผู้เล่นที่ compatible กับ court level
- `findScheduledMatch(courtId)` — filter ตาม court level
- `anyCourtCanMatch()` helper สำหรับ auto-round check
- Dedup `getMatchSchedule()` filter duplicate pairs
- Migration: `hellvenMode`, `playerLevel` default

### Snapshot-based Undo System
- `pushSnapshot()` ก่อน action แต่ละครั้ง (push/undo stack max 30)
- `undoSnapshot()` — restore snapshot ของ state ก่อนหน้านี้
- ปุ่ม ↩️ ถัดจากปุ่ม Settings
- Integration: add/remove player, clear queue, fill court, declare winner, reset session, custom match confirm

### Fix: re-pair leftover players in roundSchedule
- หลัง custom match confirm, จับคู่ `leftover` ที่เหลือใหม่ผ่าน `pairByLevel()` กันซ้ำ
- ถ้าคู่เดิมถูกจับไปแล้ว (keepSet) ไม่ใส่ซ้ำใน schedule

## Previous sessions

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

### Mobile Optimization (`polish` — 13 Jul 2026)
- Touch targets 48px (mobile) / 36px (desktop), min 44px for icon buttons
- iOS Safe Area support (env safe-area-inset)
- Prevent iOS long-press context menu (-webkit-touch-callout)
- Debounced localStorage save (300ms debounce, immediate flag)
- GPU acceleration (will-change, translateZ(0))
- Scroll lock bottom sheets (body fixed on open)
- Smooth scrolling + 100dvh (with @supports fallback)
- Focus visible outlines for accessibility
- Haptic feedback (navigator.vibrate)
- Loading spinner on fillCourt
- Long-press reorder popup (⬆️/⬇️ for mobile, 500ms hold)
- HTML5 Drag API for desktop queue reorder (unchanged)
- Chip padding increased on mobile (8px 14px, font 15px)

## Current state
- Branch: `polish` (merged feat/hellven-mode)
- Functions as async: `fillCourt`, `declareWinner`, `swapBoth`, `openCustomMatchPicker`, `removePlayer`, `resetSession`, `deleteAllData`, `checkAndAutoRound`

## Minor findings (from code review 13 Jul 2026)

### 1. VS badge 48px ไม่มี desktop fallback
`.court-floor .vs-badge` ถูกเปลี่ยนเป็น 48px ถาวร — บน desktop ใหญ่เกิน ควรเพิ่ม @media(min-width:768px) ให้กลับ 36px

### 2. Loading overlay หายตอน persist → render
showLoading append overlay แล้ว persist() เรียก render() ซึ่ง recreate DOM ทั้ง court card → overlay หาย hideLoading หาไม่เจอ (silent fail) — ไม่เสีย logic แต่ spinner อาจไม่แสดงถึงตอนจบ

### 3. saveData(true) ไม่ clear pending debounce
saveData() (debounce) → saveData(true) (immediate) — pending timer ยังอยู่ แต่ fire แล้ว JSON.stringify(data) ที่ ref เดียวกัน → ไม่เสีย data แค่ redundant

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
