import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { format } from "date-fns";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const PORT = 3000;
const db = new Database("pampa_design.db");

// Initialize Database
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

app.use(express.json());

// API Routes
app.get("/api/contents", (req, res) => {
  const today = format(new Date(), "yyyy-MM-dd");
  const contents = db.prepare("SELECT * FROM content_logs WHERE date = ? ORDER BY created_at DESC").all(today);
  res.json(contents);
});

app.post("/api/contents", async (req, res) => {
  const { title, designer } = req.body;

  if (!title || !designer) {
    return res.status(400).json({ error: "Título e Designer são obrigatórios." });
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const currentTime = format(new Date(), "HH:mm:ss");

  // Check for duplicate title today
  const existing = db.prepare("SELECT id FROM content_logs WHERE title = ? AND date = ?").get(title, today);
  if (existing) {
    return res.status(400).json({ error: "Este conteúdo já foi registrado hoje." });
  }

  try {
    const info = db.prepare("INSERT INTO content_logs (title, designer, date, time) VALUES (?, ?, ?, ?)").run(title, designer, today, currentTime);
    const newEntry = { id: info.lastInsertRowid, title, designer, date: today, time: currentTime };
    
    // Notify clients
    io.emit("content_added", newEntry);

    res.status(201).json(newEntry);
  } catch (error) {
    res.status(500).json({ error: "Erro ao salvar no banco de dados." });
  }
});

app.delete("/api/contents/:id", async (req, res) => {
  // In a real app, check for admin auth here
  const { id } = req.params;
  try {
    db.prepare("DELETE FROM content_logs WHERE id = ?").run(id);
    io.emit("content_deleted", id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir registro." });
  }
});

app.get("/api/export", (req, res) => {
  try {
    const contents = db.prepare("SELECT title, designer, date, time FROM content_logs ORDER BY date DESC, time DESC").all();
    
    // CSV Header
    let csv = "Nome do Conteúdo,Designer,Data,Hora\n";
    
    // CSV Rows
    contents.forEach((row: any) => {
      // Escape quotes and commas
      const title = `"${row.title.replace(/"/g, '""')}"`;
      const designer = `"${row.designer.replace(/"/g, '""')}"`;
      csv += `${title},${designer},${row.date},${row.time}\n`;
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=controle_conteudo_pampa.csv");
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ error: "Erro ao exportar dados." });
  }
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
}

setupVite().then(() => {
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
