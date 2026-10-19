# ScrapGrid (SurvivalCraft)

3D Vehicle Building and Physics Simulation with Three.js and Rapier3D.

---

## 🛠 Prerequisites (สิ่งที่ต้องมีบนเครื่องใหม่)

1. **Git** ([ดาวน์โหลด Git](https://git-scm.com/))
2. **Node.js** (แนะนำเวอร์ชัน 18+ หรือ 20+ LTS) ([ดาวน์โหลด Node.js](https://nodejs.org/))

---

## 🚀 How to Clone & Run (ขั้นตอนการรันบนเครื่องใหม่)

### 1. Clone โปรเจกต์
เปิด Terminal (หรือ PowerShell / Command Prompt) ในโฟลเดอร์ที่ต้องการเก็บโปรเจกต์:
```bash
git clone https://github.com/SoponSaenkaew/innocent-project.git
cd innocent-project
```

### 2. ติดตั้ง Dependencies
ติดตั้งแพ็กเกจทั้งหมดตามที่ระบุไว้ใน `package.json`:
```bash
npm install
```

### 3. รันโปรเจกต์สำหรับ Development
```bash
npm run dev
```
หลังจากรันคำสั่ง ระบบจะแสดง URL (เช่น `http://localhost:5173`) ให้เปิดในเว็บเบราว์เซอร์เพื่อเริ่มใช้งาน

---

## 📦 Scripts อื่นๆ

- `npm run build` : ตรวจสอบ TypeScript (`tsc`) และ Build ไฟล์ Production ไว้ในโฟลเดอร์ `dist/`
- `npm run preview` : ทดสอบรัน Production build ในเครื่อง