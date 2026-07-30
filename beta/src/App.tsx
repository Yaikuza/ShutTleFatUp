import { useReducer } from "react";
import { appReducer } from "./app/appReducer";
import { initialState } from "./domain/initialState";
import "./styles.css";

export default function App() {
  const [state] = useReducer(appReducer, initialState);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ShutTle Fat Up</p>
          <h1>สนามทดลอง <span>Beta</span></h1>
          <p className="lede">
            โครงใหม่สำหรับแยกตารางคู่, Hellven, Winner-stays และ Dynamic Libero
            ออกจากหน้าจอ เพื่อให้แต่ละกติกาทดสอบได้โดยไม่กระทบกัน
          </p>
        </div>
        <a className="legacy-link" href="../">กลับแอปปัจจุบัน</a>
      </header>

      <section className="status-grid">
        <article>
          <span>รอบ</span>
          <strong>{state.round}</strong>
        </article>
        <article>
          <span>ผู้เล่น</span>
          <strong>{state.players.length}</strong>
        </article>
        <article>
          <span>คู่หลัก</span>
          <strong>{state.pairs.length}</strong>
        </article>
      </section>

      <section className="beta-note">
        <p>Beta scaffold พร้อมแล้ว</p>
        <h2>ขั้นต่อไป: ย้าย matchmaking เป็น pure functions พร้อม test</h2>
        <p>
          แอปเดิมยังคงทำงานที่หน้าแรก ส่วนหน้านี้จะรับฟีเจอร์ใหม่ทีละส่วนก่อนสลับเป็นตัวจริง
        </p>
      </section>
    </main>
  );
}
