# Session notes — 30 Jun 2026

## Next session priorities

### 1. Round completion logic (P0)
- ปัจจุบัน: new round เริ่มเมื่อ schedule ทั้งหมด exhausted
- ที่ต้องการ: เมื่อคอร์ทสุดท้ายเล่นครบ gamesPerMatch → เริ่มรอบใหม่
- ถ้าอีกคอร์ทยังเล่นอยู่ → ต้องรอคอร์ทนั้นให้จบก่อน หรือเริ่มรอบใหม่โดยไม่รวมคนในคอร์ทนั้น
- โจทย์: sync รอบระหว่างหลายคอร์ท, เช็คว่าทุกคอร์ทว่างเมื่อไหร่

### 2. Table alternating row colors
- `.q-table` / `.stat-table` — ให้แถวสลับสีกัน (zebra striping) อ่านง่าย
- CSS: `tr:nth-child(even) { background: var(--muted); }`

### 3. Stats & Settings as sticky footer
- จาก bottom sheet → เป็น footer ติดอยู่ด้านล่างสุดของหน้า
- ปุ่ม 📊 สถิติ + ⚙️ ตั้งค่า อยู่ bottom fixed
- คลิกแล้วเลื่อน content ขึ้นมาแทน (หรือแสดงในพื้นที่ footer เลย)
