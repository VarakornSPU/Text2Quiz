# Text2Quiz: CEFR Level Analyzer & Automated Quiz Generator (ML)

ระบบ Machine Learning และ Natural Language Processing สำหรับวิเคราะห์ระดับภาษาอังกฤษตามกรอบมาตรฐาน **CEFR (A1, A2, B1, B2, C1, C2)** แบบละเอียด 3 ระดับ (บทความ, ประโยค, คำ) พร้อมระบบสร้างแบบทดสอบ (Quiz) และเฉลยเชิงไวยากรณ์ด้วยภาษาไทย

---

## 🌟 จุดเด่นของระบบ (Key Features)

1. **3-Level Hierarchical CEFR Analysis:**
   - **Document Level:** วิเคราะห์ระดับความยากของบทความในรูปแบบทศนิยม เช่น `B1.9`
   - **Level Breakdown:** วิเคราะห์แยกทักษะย่อย 3 ด้าน ได้แก่ **Vocabulary**, **Verb form (Tense)**, และ **Clause Complexity**
   - **Sentence Level:** ประเมินความยากรายประโยค พร้อมแสดงจำนวน Clause และ Tree Depth
   - **Word Level:** ระบายสีคำตามระดับ CEFR และเปิดดู Lemma, POS, และไวยากรณ์ได้แบบ Tooltip

2. **4 Machine Learning & Deep Learning Architectures:**
   - **Random Forest (Linguistic Features):** โมเดล ML ดั้งเดิมที่ใช้ฟีเจอร์ทางภาษา 65 มิติ (Tense, Clause, Readability, Lexical Density)
   - **Word BiLSTM:** โมเดล Deep Learning ลำดับคำ 2-layer พร้อม Attention Pooling และ 300d Pretrained Embeddings จาก spaCy
   - **Byte-LSTM:** โมเดลประมวลผลระดับตัวอักษร/ไบต์ (UTF-8) จับ Morphology รากศัพท์และคำลงท้ายได้โดยไม่มีปัญหา OOV
   - **Hybrid Model (Best Performing):** รวมจุดแข็งของ BiLSTM Contextual Representation เข้ากับ Linguistic Grammar Features

3. **Rule-Based Quiz Generator with Thai Explanations:**
   - สร้างควิซ 3 หมวดหมู่: **Vocabulary Cloze**, **Verb Tense & Form**, และ **Sentence Structure**
   - มีเฉลยและคำอธิบายภาษาไทยอย่างละเอียด อิงตามไวยากรณ์และระดับ CEFR จริง
   - ตรวจคำตอบแบบโต้ตอบ พร้อมคำนวณคะแนนและสถิติแยกตามหมวดหมู่

4. **Interactive Data Visualization (Tab 3):**
   - **Part-of-Speech Explorer:** คลิกเลือกหมวดคำ (Noun, Verb, Adjective ฯลฯ) เพื่อไฮไลต์คำในบทความ
   - **Interactive Dependency Parse Tree:** แสดงเส้นเชื่อมความสัมพันธ์ของคำ (SVG) และแผนผัง Clause
   - **CEFR Progression Flow:** กราฟเส้นแสดงการเปลี่ยนแปลงระดับความยากของแต่ละประโยคตลอดบทความ
   - **Linguistic Radar Chart:** เปรียบเทียบฟีเจอร์ของบทความกับเกณฑ์มาตรฐาน CEFR
   - **Lemmatization Proof Table:** แสดงการพิสูจน์ความจำเป็นของการทำ Lemma ก่อนค้นหาใน Wordlist

---

## 🚀 วิธีการติดตั้งและเริ่มใช้งาน (Quick Start)

### 1. ติดตั้ง Dependencies (Python 3.11)
```powershell
py -3.11 -m pip install -r backend/requirements.txt
py -3.11 -m spacy download en_core_web_md
```

### 2. การเทรนโมเดล (Model Training)
```powershell
# รันเทรนแบบทดสอบเร็ว (Quick Mode)
py -3.11 backend/ml_models.py --quick

# รันเทรนแบบเต็มรูปแบบ (Full Dataset)
py -3.11 backend/ml_models.py
```

### 3. รัน Backend API (FastAPI)
```powershell
py -3.11 -m uvicorn app:app --app-dir backend --port 8000 --reload
```
API จะเปิดทำงานที่ `http://localhost:8000` (ดูเอกสาร Swagger ได้ที่ `http://localhost:8000/docs`)

### 4. รัน Frontend (React + Vite)
```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```
เปิดเว็บบราวเซอร์ที่ `http://localhost:5173`

---

## 📁 โครงสร้างโปรเจกต์ (Clean Directory Layout)

```
Project Text2Quiz Final/
├── Dataset Project ML/        # โฟลเดอร์ชุดข้อมูลดิบ (CEFR-SP, ReadMe, Wordlist)
├── backend/
│   ├── nlp_core.py            # ตัวประมวลผลทางภาษา, Tense/Clause Detector, Feature Extraction
│   ├── ml_models.py           # ตัวจัดการข้อมูล, เทรนและประเมินผลทั้ง 4 โมเดล
│   ├── quiz.py                # ระบบสร้างควิซและตรวจคำตอบพร้อมคำอธิบายภาษาไทย
│   ├── app.py                 # FastAPI Web Server & REST API Endpoints
│   ├── requirements.txt       # รายการ Library ของ Python
│   └── artifacts/             # ผลลัพธ์จากการเทรน (โมเดล .joblib, .pt, และ metrics.json)
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # โครงสร้างหลักและแท็บนำทาง
│   │   ├── AnalyzeTab.jsx     # Tab 1: หน้าหลักวิเคราะห์ CEFR และทำควิซ
│   │   ├── CompareTab.jsx     # Tab 2: ตารางและกราฟเปรียบเทียบประสิทธิภาพโมเดล
│   │   ├── VisualizeTab.jsx   # Tab 3: Interactive Visualizations (POS, Tree, Radar)
│   │   ├── ui.jsx             # ชิ้นส่วน UI ส่วนกลาง (Badge, Progress Bar, CEFR Colors)
│   │   └── styles.css         # ดีไซน์และชุดสี
│   ├── package.json
│   └── vite.config.js
└── README.md
```

