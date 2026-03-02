import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const PORT = 3000;
// Garante que o banco de dados seja criado no diretório da aplicação
const dbPath = path.join(__dirname, "pampa_design.db");
const db = new Database(dbPath);

// Inicialização simplificada do Banco
db.exec(`
  CREATE TABLE IF NOT EXISTS content_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    designer TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- ROTAS DE API (Prioridade Total) ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", db: dbPath });
});

app.get("/api/contents", (req, res) => {
  try {
    const today = format(new Date(), "yyyy-MM-dd");
    const contents = db.prepare("SELECT * FROM content_logs WHERE date = ? ORDER BY created_at DESC").all(today);
    res.json(contents);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar dados" });
  }
});

app.post("/api/contents", (req, res) => {
  const { title, designer } = req.body;
  if (!title || !designer) return res.status(400).json({ error: "Campos obrigatórios faltando" });

  const today = format(new Date(), "yyyy-MM-dd");
  const currentTime = format(new Date(), "HH:mm:ss");

  try {
    const existing = db.prepare("SELECT id FROM content_logs WHERE title = ? AND date = ?").get(title, today);
    if (existing) return res.status(400).json({ error: "Já registrado hoje." });

    const info = db.prepare("INSERT INTO content_logs (title, designer, date, time) VALUES (?, ?, ?, ?)").run(title, designer, today, currentTime);
    const newEntry = { id: info.lastInsertRowid, title, designer, date: today, time: currentTime };
    
    io.emit("content_added", newEntry);
    res.status(201).json(newEntry);
  } catch (error) {
    res.status(500).json({ error: "Erro ao salvar" });
  }
});

app.delete("/api/contents/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM content_logs WHERE id = ?").run(req.params.id);
    io.emit("content_deleted", req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir" });
  }
});

app.get("/api/export", (req, res) => {
  try {
    const contents = db.prepare("SELECT title, designer, date, time FROM content_logs ORDER BY date DESC").all();
    let csv = "\ufeffNome do Conteudo,Designer,Data,Hora\n"; // BOM para Excel abrir acentos corretamente
    contents.forEach((row: any) => {
      csv += `"${row.title.replace(/"/g, '""')}","${row.designer.replace(/"/g, '""')}",${row.date},${row.time}\n`;
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=pampa_controle.csv");
    res.send(csv);
  } catch (error) {
    res.status(500).send("Erro na exportação");
  }
});

// --- SERVIDO DOS ARQUIVOS FRONTEND ---

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> SISTEMA PAMPA ONLINE NA PORTA ${PORT}`);
    console.log(`>>> BANCO DE DADOS EM: ${dbPath}`);
  });
}

start();
