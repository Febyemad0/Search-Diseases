const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");

const app = express();
const db = new sqlite3.Database("diseases.db");

app.use(bodyParser.json());
app.use(express.static(__dirname));

// إنشاء الجداول إذا مش موجودة
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS diseases (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)");
    db.run("CREATE TABLE IF NOT EXISTS symptoms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)");
    db.run("CREATE TABLE IF NOT EXISTS disease_symptoms (disease_id INTEGER, symptom_id INTEGER)");
});

// إضافة مرض جديد
app.post("/add", (req, res) => {
    const { name, symptoms } = req.body;
    const diseaseName = name.trim();
    if (!diseaseName || !symptoms.length) return res.json({ status: "error", message: "Invalid input" });

    db.run("INSERT OR IGNORE INTO diseases (name) VALUES (?)", [diseaseName], function() {
        db.get("SELECT id FROM diseases WHERE name=?", [diseaseName], (err, disease) => {
            if (!disease) return res.json({ status: "error" });
            symptoms.forEach(s => {
                const s_clean = s.trim().toLowerCase();
                db.run("INSERT OR IGNORE INTO symptoms (name) VALUES (?)", [s_clean], function() {
                    db.get("SELECT id FROM symptoms WHERE name=?", [s_clean], (err, symptom) => {
                        db.run("INSERT OR IGNORE INTO disease_symptoms VALUES (?,?)", [disease.id, symptom.id]);
                    });
                });
            });
        });
    });
    res.json({ status: "ok" });
});

// البحث بالـ 3 أعراض + Pagination + AND logic
app.post("/search", (req, res) => {
    let symptoms = req.body.symptoms || [];
    // تنظيف الأعراض
    symptoms = symptoms.map(s => s.trim().toLowerCase()).filter(s => s);
    const page = req.body.page || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    if (!symptoms.length) return res.json({ results: [], total: 0 });

    const placeholders = symptoms.map(() => "?").join(",");

    // حساب العدد الكلي للنتائج
    const countSql = `
        SELECT COUNT(DISTINCT d.id) as total
        FROM diseases d
        JOIN disease_symptoms ds ON d.id = ds.disease_id
        JOIN symptoms s ON ds.symptom_id = s.id
        WHERE s.name IN (${placeholders})
        GROUP BY d.id
        HAVING COUNT(DISTINCT s.name) = ?
    `;

    db.all(countSql, [...symptoms, symptoms.length], (err, rows) => {
        const total = rows ? rows.length : 0;

        const sql = `
            SELECT d.name
            FROM diseases d
            JOIN disease_symptoms ds ON d.id = ds.disease_id
            JOIN symptoms s ON ds.symptom_id = s.id
            WHERE s.name IN (${placeholders})
            GROUP BY d.id
            HAVING COUNT(DISTINCT s.name) = ?
            LIMIT ? OFFSET ?
        `;

        db.all(sql, [...symptoms, symptoms.length, limit, offset], (err2, dataRows) => {
            res.json({
                results: dataRows ? dataRows.map(r => r.name) : [],
                total
            });
        });
    });
});

// مثال لإضافة بيانات أولية
const sampleDiseases = [
  {name:"Reactive Arthritis", symptoms:["painful joint","painful urination","conjunctivitis"]},
  {name:"Urinary Tract Infection", symptoms:["painful urination","frequent urination","cloudy urine"]},
  {name:"Influenza", symptoms:["fever","cough","fatigue"]},
  {name:"Common Cold", symptoms:["runny nose","cough","sore throat"]},
  {name:"Diabetes", symptoms:["excessive thirst","frequent urination","fatigue"]},
  {name:"Hypertension", symptoms:["headache","dizziness","blurred vision"]},
  {name:"Rheumatoid Arthritis", symptoms:["painful joint","stiffness","swelling"]},
  {name:"Appendicitis", symptoms:["abdominal pain","nausea","vomiting"]},
  {name:"Migraine", symptoms:["headache","nausea","sensitivity to light"]},
  {name:"COVID-19", symptoms:["fever","cough","loss of taste or smell"]}
];

sampleDiseases.forEach(d => {
    db.run("INSERT OR IGNORE INTO diseases (name) VALUES (?)", [d.name], function() {
        db.get("SELECT id FROM diseases WHERE name=?", [d.name], (err, disease) => {
            d.symptoms.forEach(s => {
                const s_clean = s.trim().toLowerCase();
                db.run("INSERT OR IGNORE INTO symptoms (name) VALUES (?)", [s_clean], function() {
                    db.get("SELECT id FROM symptoms WHERE name=?", [s_clean], (err, symptom) => {
                        db.run("INSERT OR IGNORE INTO disease_symptoms VALUES (?,?)", [disease.id, symptom.id]);
                    });
                });
            });
        });
    });
});

app.listen(3000, () => console.log("Server ready at http://localhost:3000"));
